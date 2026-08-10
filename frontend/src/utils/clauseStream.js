/**
 * Clause splitter for streaming TTS.
 *
 * The voice pipeline speaks each chunk the moment it is emitted, so where we cut the
 * token stream directly controls time-to-first-audio. Pulled out of ModuleGemma so the
 * splitting rules can be unit-tested without an Ollama server.
 */

// Thresholds trade time-to-first-audio against choppiness.
export const MIN_CHUNK_WORDS = 3;         // never speak a fragment shorter than this
export const FIRST_CHUNK_MIN_WORDS = 4;   // first chunk: flush early, latency is most visible
export const CLAUSE_MIN_WORDS = 8;        // later chunks: prefer longer, smoother runs

const CLAUSE_BREAKS = [',', ';', ':', '—', '–'];

export const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// Trailing "." that belongs to an abbreviation rather than a sentence. Without this,
// "Fees are Rs. 12000" is cut after "Rs." and spoken as a finished sentence — wrong
// pause and wrong intonation, and price answers are the common case for this kiosk.
// Also covers initials ("Mr A. Kumar"). Over-splitting is worse than under-splitting,
// so borderline cases like "etc." are deliberately treated as abbreviations.
const ABBREVIATION_TAIL =
  /(^|\s)(rs|no|mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|inc|ltd|pvt|govt|dept|fig|eg|ie|am|pm|[a-z])\.$/i;

/** All clause-break indices in the buffer, ascending. */
export const findClauseBreaks = (s) => {
  const idxs = [];
  for (let i = 0; i < s.length; i++) {
    if (CLAUSE_BREAKS.includes(s[i])) idxs.push(i);
  }
  return idxs;
};

// Punctuation followed by whitespace OR sitting at the end of the buffer. The
// end-of-buffer case matters because short answers are a single sentence ending in "."
// with no trailing space — a whitespace-only rule never fires for them, so the whole
// response ends up spoken as one post-generation chunk.
const SENTENCE_END = /^([\s\S]*?[.!?])(\s+|$)([\s\S]*)$/;

/**
 * Create a stateful splitter.
 *
 * @param {(chunk: string) => void} onChunk called for each speakable clause, in order
 * @returns {{push:(token:string)=>void, flush:()=>void, get pending():string}}
 */
export function createClauseSplitter(onChunk) {
  let buffer = '';
  let emittedAny = false;

  return {
    /** Feed one token from the LLM stream. */
    push(token) {
      if (!token) return;
      buffer += token;

      let m;
      while ((m = SENTENCE_END.exec(buffer)) !== null) {
        const complete = m[1].trim();
        // Too short to be a sentence (guards decimals like "3.5") — wait for more tokens.
        if (countWords(complete) < MIN_CHUNK_WORDS) break;
        // Long enough, but the "." belongs to an abbreviation — also not a sentence end.
        if (ABBREVIATION_TAIL.test(complete)) break;
        onChunk(complete);
        emittedAny = true;
        buffer = m[3];
      }

      // Clause split.
      const isFirst = !emittedAny;
      const minWords = isFirst ? FIRST_CHUNK_MIN_WORDS : CLAUSE_MIN_WORDS;
      if (countWords(buffer) >= minWords) {
        // First chunk takes the EARLIEST usable break — time-to-first-audio is what the
        // user perceives as responsiveness. Later chunks take the latest usable break so
        // delivery stays smooth. Scanning all breaks (rather than only the last) matters
        // when a sentence opens with a short clause: "Haan bhaiya, ..." would otherwise
        // pin the split on a 2-word head forever and never split at all.
        const breaks = findClauseBreaks(buffer);
        const ordered = isFirst ? breaks : breaks.slice().reverse();
        for (const idx of ordered) {
          const head = buffer.substring(0, idx).trim();
          if (countWords(head) >= MIN_CHUNK_WORDS) {
            onChunk(head);
            emittedAny = true;
            buffer = buffer.substring(idx + 1).trim();
            break;
          }
        }
      }
    },

    /** Emit whatever is left. Skip after an interruption — the user is already talking. */
    flush() {
      const tail = buffer.trim();
      buffer = '';
      if (tail) {
        onChunk(tail);
        emittedAny = true;
      }
    },

    get pending() {
      return buffer;
    },
  };
}
