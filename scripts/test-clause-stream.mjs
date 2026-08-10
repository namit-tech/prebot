// Exercises the real shipped splitter against realistic Gemma output.
// Run with: npm run test:voice
import { createClauseSplitter } from '../frontend/src/utils/clauseStream.js';

let failures = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
};

// Feed a string token-by-token the way Ollama streams it (word fragments).
const run = (text, { flush = true } = {}) => {
  const out = [];
  const s = createClauseSplitter((c) => out.push(c));
  for (const tok of text.match(/\S+\s*|\s+/g) || []) s.push(tok);
  if (flush) s.flush();
  return out;
};

console.log('\nclauseStream — first-chunk latency');
// The 10-word capped answer: previously emitted nothing until generation finished.
check(
  'short single sentence still streams before the end',
  run('Our course fee is twelve thousand rupees, including all study material.'),
  ['Our course fee is twelve thousand rupees', 'including all study material.']
);

check(
  'no clause break: emits once at the terminal period',
  run('The next batch starts on Monday morning'),
  ['The next batch starts on Monday morning']
);

console.log('\nclauseStream — sentence handling');
check(
  'multiple sentences split individually',
  run('Yes we do. Classes run every evening. Fees are due monthly.'),
  ['Yes we do.', 'Classes run every evening.', 'Fees are due monthly.']
);

console.log('\nclauseStream — false-positive guards');
check(
  'decimal is not treated as a sentence end',
  run('The discount is 12.5 percent for early birds'),
  ['The discount is 12.5 percent for early birds']
);

check(
  'abbreviation is not treated as a sentence end',
  run('Fees are Rs. 12000 per semester'),
  ['Fees are Rs. 12000 per semester']
);

console.log('\nclauseStream — interruption');
{
  const out = [];
  const s = createClauseSplitter((c) => out.push(c));
  for (const tok of 'Our fee structure is quite flexible, and we also offer'.match(/\S+\s*/g)) s.push(tok);
  // Barge-in: flush() is deliberately NOT called.
  check('aborted turn does not speak its tail', out, ['Our fee structure is quite flexible']);
  check('unspoken remainder stays buffered', s.pending.trim(), 'and we also offer');
}

console.log('\nclauseStream — hinglish (code-switched input)');
// "Haan bhaiya" is only 2 words, below MIN_CHUNK_WORDS — speaking it alone would sound
// clipped, so the sentence is kept whole. Documented behaviour, not a miss.
check(
  'short opening clause is not spoken on its own',
  run('Haan bhaiya, course ka price bara hazaar rupees hai.'),
  ['Haan bhaiya, course ka price bara hazaar rupees hai.']
);

check(
  'hinglish splits once a clause is long enough',
  run('Haan bhaiya ye course online hai, aur placement support bhi milta hai.'),
  ['Haan bhaiya ye course online hai', 'aur placement support bhi milta hai.']
);

console.log('\nclauseStream — first chunk picks the earliest usable break');
check(
  'earliest break wins for the first chunk (lower latency)',
  run('Our fees are twelve thousand, including material, and books.'),
  ['Our fees are twelve thousand', 'including material, and books.']
);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
