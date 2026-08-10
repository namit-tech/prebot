/**
 * GeminiLiveSession — real-time, full-duplex voice session with the Gemini Live API.
 *
 * Replaces the online-mode STT -> LLM -> TTS chain with a single bidirectional
 * WebSocket. Gemini's native-audio model listens continuously, understands
 * free-form speech, generates the response, and speaks it back in its own voice.
 * Server-side VAD drives barge-in: when the user talks over the assistant, the
 * server sends `interrupted` and we flush playback so it stops and listens again —
 * exactly like a phone call.
 *
 * One Gemini API key authenticates everything; there is no separate STT/TTS service.
 *
 * Audio contract:
 *   - mic in : 16 kHz mono 16-bit PCM (we force a 16 kHz capture AudioContext so the
 *              browser resamples the mic for us; the worklet only does float->int16)
 *   - out    : 24 kHz mono 16-bit PCM, scheduled gaplessly for smooth playback
 */

// v1alpha is required for native-audio features (affective dialog, proactive audio);
// it is a superset of v1beta so voice + tools + search all work here too.
const LIVE_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Default to the faster half-cascade Live model (lower time-to-first-audio than
// native-audio-dialog). Override via localStorage.gemini_live_model. Model discovery
// keeps this if it's available on the key, else falls back to the best Live model.
export const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const DEFAULT_LIVE_VOICE = 'Kore';

// Prebuilt Gemini voices selectable in Live mode (system TTS voices don't apply here).
export const GEMINI_LIVE_VOICES = [
  { id: 'Aoede', label: 'Aoede (Female, Breezy & Conversational)' },
  { id: 'Charon', label: 'Charon (Male, Calm & Professional)' },
  { id: 'Fenrir', label: 'Fenrir (Male, Excitable & Energetic)' },
  { id: 'Kore', label: 'Kore (Female, Firm & Professional)' },
  { id: 'Leda', label: 'Leda (Female, Youthful & Energetic)' },
  { id: 'Orus', label: 'Orus (Male, Firm & Calm)' },
  { id: 'Puck', label: 'Puck (Male, Upbeat & Lively)' },
  { id: 'Zephyr', label: 'Zephyr (Female, Bright & Clear)' },
];

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

// AudioWorklet processor, embedded as a Blob URL so it resolves identically in Vite
// dev, packaged Electron (file://), and production — no static asset path to get wrong.
const CAPTURE_WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 1600; // ~100ms at 16kHz
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      if (this._buf.length >= this._target) {
        const chunk = this._buf;
        this._buf = [];
        const int16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          let s = Math.max(-1, Math.min(1, chunk[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(int16.buffer, [int16.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
`;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16Array(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(len / 2));
}

export default class GeminiLiveSession {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey        Gemini API key (same one used for REST).
   * @param {string} [opts.model]       Native-audio model id.
   * @param {string} [opts.voice]       Prebuilt voice name.
   * @param {string} [opts.systemInstruction] System prompt / persona (+ foundation knowledge).
   * @param {MediaStreamConstraints["audio"]} [opts.audioConstraints] Mic constraints (echo cancellation!).
   * @param {Array} [opts.functionDeclarations] Tool/function schemas Gemini may call to act in the app.
   * @param {boolean} [opts.enableSearch] Google Search grounding — real-time web answers with sources.
   * @param {boolean} [opts.enableProactiveAudio] Model decides when to reply; ignores background chatter.
   * @param {boolean} [opts.enableAffectiveDialog] Emotion-aware — adapts tone to the user's mood.
   * @param {object} [opts.callbacks]   Event hooks (see below).
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.model || DEFAULT_LIVE_MODEL;
    this.voice = opts.voice || DEFAULT_LIVE_VOICE;
    this.systemInstruction = opts.systemInstruction || '';
    this.audioConstraints = opts.audioConstraints || { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    this.autoResolveModel = opts.autoResolveModel !== false; // discover a valid Live model unless pinned
    this.vadConfig = opts.vadConfig || null; // tune turn-end + barge-in sensitivity
    this.disableThinking = opts.disableThinking || false; // cut "thinking" latency before first word
    this.functionDeclarations = opts.functionDeclarations || [];
    this.enableSearch = opts.enableSearch || false;
    this.enableProactiveAudio = opts.enableProactiveAudio || false;
    this.enableAffectiveDialog = opts.enableAffectiveDialog || false;
    // Cost guards. A Live session bills for streamed audio the whole time it is open, so an
    // unattended kiosk left connected costs money for an empty room — this is the single
    // largest source of unexpected spend. 0 disables a guard.
    this.idleTimeoutMs = opts.idleTimeoutMs || 0;   // no user speech for this long -> hang up
    this.maxSessionMs = opts.maxSessionMs || 0;     // absolute ceiling regardless of activity
    this.cb = opts.callbacks || {};

    this.ws = null;
    this.micStream = null;
    this.captureCtx = null;
    this.workletNode = null;
    this.workletUrl = null;

    this.playbackCtx = null;
    this.scheduledSources = new Set();
    this.nextStartTime = 0;

    this.stopped = false;          // user intentionally stopped — do not auto-reconnect
    this.setupComplete = false;
    this.everLive = false;         // true once a session completed setup at least once
    this.reconnectAttempts = 0;    // capped so a fatal error can't loop forever
    this.modelSpeaking = false;
    this.resumptionHandle = null;  // for transparent reconnect on session time-limit
    this._userTranscript = '';
    this._modelTranscript = '';
    this._turnStartAt = 0;         // timing: first user word of the turn
    this._lastInputAt = 0;         // timing: most recent user word (≈ when they stopped)
    this._idleTimer = null;
    this._sessionTimer = null;     // armed once for the whole session, never on reconnect

    // --- Billing metering ---------------------------------------------------
    // Live API bills by streamed audio, so connected wall-clock time is the primary
    // cost driver. Tokens come from the server's own usageMetadata rather than being
    // estimated here — if these numbers are ever shown to a client, they need to be
    // defensible against Google's console, not our arithmetic.
    this._sessionStartedAt = null;   // epoch ms, first successful setup
    this._connectedMs = 0;           // accumulated connected time across reconnects
    this._lastConnectAt = null;
    this._usage = { promptTokens: 0, responseTokens: 0, totalTokens: 0, modalities: {} };
    this._turns = 0;
    this._usageReported = false;   // guards double-counting on repeated stop()
  }

  /** Fold one server usageMetadata payload into the session totals. */
  _accumulateUsage(um) {
    if (!um) return;
    const add = (a, b) => (Number(a) || 0) + (Number(b) || 0);
    this._usage.promptTokens = add(this._usage.promptTokens, um.promptTokenCount);
    this._usage.responseTokens = add(
      this._usage.responseTokens,
      um.responseTokenCount ?? um.candidatesTokenCount
    );
    this._usage.totalTokens = add(this._usage.totalTokens, um.totalTokenCount);

    // Per-modality breakdown drives cost: audio tokens are priced very differently
    // from text. Field naming has shifted across API versions, so read defensively
    // and keep whatever buckets the server actually sends.
    for (const key of ['promptTokensDetails', 'responseTokensDetails', 'candidatesTokensDetails']) {
      for (const d of um[key] || []) {
        const modality = d.modality || 'UNKNOWN';
        this._usage.modalities[modality] = add(this._usage.modalities[modality], d.tokenCount);
      }
    }
  }

  /**
   * Billing snapshot for this session. Duration is authoritative; tokens are present
   * only if the server reported them.
   */
  getUsageReport() {
    const connectedMs = this._connectedMs + (this._lastConnectAt ? Date.now() - this._lastConnectAt : 0);
    return {
      model: this.model,
      voice: this.voice,
      startedAt: this._sessionStartedAt ? new Date(this._sessionStartedAt).toISOString() : null,
      endedAt: new Date().toISOString(),
      connectedMs,
      connectedMinutes: Math.round((connectedMs / 60000) * 100) / 100,
      turns: this._turns,
      ...this._usage,
      // Tokens are absent on some model/version combinations; the consumer must not
      // silently treat that as zero usage.
      tokensReported: this._usage.totalTokens > 0,
    };
  }

  /**
   * Cost guards. Fires `onAutoClose(reason)` rather than tearing down here — the caller owns
   * session lifecycle and its UI state would desync if we stopped ourselves.
   */
  _armSessionTimers() {
    if (this.idleTimeoutMs) this._touchIdle();
    // Armed once. Re-arming on every reconnect would let a session that drops periodically
    // run forever, which is exactly the case the ceiling exists to catch.
    if (this.maxSessionMs && !this._sessionTimer) {
      this._sessionTimer = setTimeout(() => {
        console.warn(`[Live] session hit the ${Math.round(this.maxSessionMs / 1000)}s ceiling — closing`);
        this._emit('onAutoClose', 'max_session');
      }, this.maxSessionMs);
    }
  }

  /** Called whenever the user actually speaks — proof a human is still present. */
  _touchIdle() {
    if (!this.idleTimeoutMs) return;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      console.warn(`[Live] no speech for ${Math.round(this.idleTimeoutMs / 1000)}s — closing idle session`);
      this._emit('onAutoClose', 'idle');
    }, this.idleTimeoutMs);
  }

  _clearSessionTimers() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    if (this._sessionTimer) { clearTimeout(this._sessionTimer); this._sessionTimer = null; }
  }

  _emit(name, arg) {
    try { this.cb[name] && this.cb[name](arg); } catch (e) { console.error(`[Live] callback ${name} threw`, e); }
  }

  async start() {
    if (!this.apiKey) {
      this._emit('onError', 'Gemini API key is missing.');
      return false;
    }
    this.stopped = false;
    try {
      await this._openMic();
      this._openPlayback();
      if (this.autoResolveModel) await this._resolveModel();
      await this._connect();
      return true;
    } catch (err) {
      console.error('[Live] start failed:', err);
      this._emit('onError', err.message || String(err));
      this.stop();
      return false;
    }
  }

  // Discover a Live model that actually exists on this key. Preview native-audio ids rotate
  // and aren't on every account, so we query the model list and keep only those supporting
  // the Live method (bidiGenerateContent), preferring native-audio, then any working Live model.
  async _resolveModel() {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}&pageSize=1000`
      );
      if (!res.ok) return;
      const data = await res.json();
      const live = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'))
        .map((m) => m.name.replace(/^models\//, ''));
      if (!live.length) {
        console.warn('[Live] no bidiGenerateContent models on this key — keeping', this.model);
        return;
      }
      console.log('[Live] available Live models:', live);
      const pick =
        live.find((m) => m === this.model) ||
        live.find((m) => m.includes('native-audio') && m.includes('dialog')) ||
        live.find((m) => m.includes('native-audio')) ||
        live.find((m) => m.includes('live')) ||
        live[0];
      if (pick && pick !== this.model) {
        console.log(`[Live] model "${this.model}" unavailable — using "${pick}"`);
        this.model = pick;
      }
    } catch (e) {
      console.warn('[Live] model discovery failed — keeping', this.model, e);
    }
  }

  async _openMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints });
    // Forcing 16 kHz makes the browser resample the mic — worklet stays a pure float->int16 pass.
    this.captureCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: CAPTURE_SAMPLE_RATE });
    if (this.captureCtx.state === 'suspended') await this.captureCtx.resume();

    const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
    this.workletUrl = URL.createObjectURL(blob);
    await this.captureCtx.audioWorklet.addModule(this.workletUrl);

    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.captureCtx, 'pcm-capture-processor');
    this.workletNode.port.onmessage = (e) => this._sendAudioChunk(e.data);
    source.connect(this.workletNode);
    // Do NOT connect the worklet to destination — we don't want the mic echoed to speakers.
  }

  _openPlayback() {
    this.playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.nextStartTime = 0;
  }

  _wsUrl() {
    return `${LIVE_WS_BASE}?key=${encodeURIComponent(this.apiKey)}`;
  }

  _connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this._wsUrl());
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this._sendSetup();
      };
      ws.onmessage = async (event) => {
        const handled = await this._handleServerMessage(event.data);
        if (handled === 'setup' && !settled) { settled = true; resolve(true); }
      };
      ws.onerror = (e) => {
        console.error('[Live] websocket error', e);
        if (!settled) { settled = true; reject(new Error('WebSocket connection failed')); }
        this._emit('onError', 'Live connection error');
      };
      ws.onclose = (e) => {
        console.log(`[Live] websocket closed (${e.code}) ${e.reason || ''}`);
        this.setupComplete = false;
        // Bank the connected interval so a gap between reconnects isn't billed as usage.
        if (this._lastConnectAt) {
          this._connectedMs += Date.now() - this._lastConnectAt;
          this._lastConnectAt = null;
        }
        if (this.stopped) { this._emit('onClose'); return; }
        if (!this.everLive) {
          // Closed before the session ever went live — a config/auth/setup error
          // (e.g. bad model id or rejected field), NOT a transient drop. Don't loop.
          this._emit('onError', e.reason || `Live setup rejected (code ${e.code})`);
          return;
        }
        // Session time-limit or transient drop after going live — resume transparently.
        this._reconnect();
      };
    });
  }

  // Turn-taking config. Empty object = Google defaults; we pass tuned values for a kiosk:
  //  - silenceDurationMs  : how long a pause ends the user's turn (the "chop" point)
  //  - startOfSpeechSensitivity : how eagerly the user's voice barges in over the model
  //  - endOfSpeechSensitivity   : how decisively a pause commits the turn
  //  - prefixPaddingMs    : min speech before a "start" counts (filters coughs/clicks)
  _buildVadConfig() {
    const v = this.vadConfig;
    if (!v) return {};
    const aad = {};
    if (v.disabled) aad.disabled = true;
    if (v.startOfSpeechSensitivity) aad.startOfSpeechSensitivity = v.startOfSpeechSensitivity;
    if (v.endOfSpeechSensitivity) aad.endOfSpeechSensitivity = v.endOfSpeechSensitivity;
    if (Number.isFinite(v.prefixPaddingMs)) aad.prefixPaddingMs = v.prefixPaddingMs;
    if (Number.isFinite(v.silenceDurationMs)) aad.silenceDurationMs = v.silenceDurationMs;
    return aad;
  }

  _sendSetup() {
    const cfg = {
      model: this.model.startsWith('models/') ? this.model : `models/${this.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } },
        },
        // Skip internal "thinking" so the first spoken word arrives sooner.
        ...(this.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
      // Native transcripts of both sides — used for UI text, history, repeat detection.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Server-side automatic VAD — drives both turn-end ("chop") and barge-in.
      realtimeInputConfig: { automaticActivityDetection: this._buildVadConfig() },
      // Survive the native-audio session time limit without dropping the conversation.
      sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {},
      // A kiosk session runs for a whole seminar. Without compression every past audio turn
      // stays in context, so latency and per-turn cost climb until the session hits its
      // limit. A sliding window keeps context bounded and the session alive indefinitely.
      contextWindowCompression: { slidingWindow: {} },
    };
    if (this.systemInstruction) {
      cfg.systemInstruction = { parts: [{ text: this.systemInstruction }] };
    }

    // Tools: function calling (act in the app) + Google Search grounding (live web answers).
    const tools = [];
    if (this.functionDeclarations.length) tools.push({ functionDeclarations: this.functionDeclarations });
    if (this.enableSearch) tools.push({ googleSearch: {} });
    if (tools.length) cfg.tools = tools;

    // Emotion-aware voice + noise-robust turn-taking (native-audio only).
    if (this.enableAffectiveDialog) cfg.enableAffectiveDialog = true;
    if (this.enableProactiveAudio) cfg.proactivity = { proactiveAudio: true };

    this.ws.send(JSON.stringify({ setup: cfg }));
  }

  async _handleServerMessage(data) {
    let text;
    if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (data instanceof Blob) text = await data.text();
    else text = data;

    let msg;
    try { msg = JSON.parse(text); } catch { return null; }

    if (msg.setupComplete) {
      this.setupComplete = true;
      this.everLive = true;
      console.log('[Live] setup complete — session live');
      // Meter connected time from setup, not socket open: billing starts when the
      // session is actually usable. Reconnects resume the same accumulator.
      if (!this._sessionStartedAt) this._sessionStartedAt = Date.now();
      this._lastConnectAt = Date.now();
      this._armSessionTimers();
      this._emit('onOpen');
      this._emit('onListening');
      return 'setup';
    }

    // Token accounting can ride along with any server message.
    if (msg.usageMetadata) this._accumulateUsage(msg.usageMetadata);

    if (msg.sessionResumptionUpdate) {
      if (msg.sessionResumptionUpdate.resumable && msg.sessionResumptionUpdate.newHandle) {
        this.resumptionHandle = msg.sessionResumptionUpdate.newHandle;
      }
      return null;
    }

    if (msg.goAway) {
      console.log('[Live] server goAway — will resume');
      // ws.onclose follows; _reconnect() handles it.
      return null;
    }

    if (msg.serverContent) {
      this._handleServerContent(msg.serverContent);
      return null;
    }

    // Gemini wants to run an app action (function calling).
    if (msg.toolCall && msg.toolCall.functionCalls) {
      this._emit('onToolCall', msg.toolCall.functionCalls);
      return null;
    }

    // Server cancelled pending tool calls (e.g. user interrupted before we responded).
    if (msg.toolCallCancellation) {
      this._emit('onToolCancel', msg.toolCallCancellation.ids || []);
      return null;
    }

    return null;
  }

  /**
   * Reply to Gemini's function calls so it can continue the spoken turn.
   * @param {Array<{id:string,name:string,response:object}>} functionResponses
   */
  sendToolResponse(functionResponses) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }

  _handleServerContent(sc) {
    // Real content flowing = the session genuinely works → reset the failure counter.
    // (Doing this here, not on setupComplete, so a setup that immediately fails can't loop.)
    this.reconnectAttempts = 0;

    // Barge-in: user spoke over the model. Stop talking, listen again.
    if (sc.interrupted) {
      this._flushPlayback();
      this.modelSpeaking = false;
      // The interrupted turn never reaches turnComplete, so reset our per-turn buffers here —
      // otherwise the next turn's transcript concatenates onto this cut-off one, corrupting
      // lastAnswer/history. (Gemini keeps the true partial in its own server-side context.)
      this._userTranscript = '';
      this._modelTranscript = '';
      this._turnStartAt = 0;
      this._lastInputAt = 0;
      this._emit('onInterrupted');
      this._emit('onListening');
      return;
    }

    // Incremental transcripts.
    if (sc.inputTranscription && sc.inputTranscription.text) {
      const now = performance.now();
      if (!this._turnStartAt) this._turnStartAt = now;
      this._lastInputAt = now; // keeps advancing while the user talks; freezes when they stop
      this._userTranscript += sc.inputTranscription.text;
      // Transcribed speech is the only reliable "a human is still here" signal — open sockets
      // and model audio are not, since both continue in an empty room.
      this._touchIdle();
      this._emit('onUserTranscript', this._userTranscript.trim());
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      this._modelTranscript += sc.outputTranscription.text;
      this._emit('onModelTranscript', this._modelTranscript.trim());
    }

    // Model audio chunks.
    const parts = sc.modelTurn && sc.modelTurn.parts ? sc.modelTurn.parts : [];
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data;
      if (inline && inline.data) {
        if (!this.modelSpeaking) {
          this.modelSpeaking = true;
          // The gap from the user's last transcribed word to the first audio =
          // (leftover VAD silence wait) + network + model time-to-first-token.
          const gap = this._lastInputAt ? Math.round(performance.now() - this._lastInputAt) : -1;
          console.log(`[Live][timing] ⏱️ first audio ${gap}ms after user's last words | silence target ${this._buildVadConfig().silenceDurationMs ?? 'default'}ms`);
          this._emit('onModelAudioStart');
        }
        this._enqueuePcm(inline.data);
      }
    }

    if (sc.turnComplete) {
      const answer = this._modelTranscript.trim();
      const question = this._userTranscript.trim();
      this.modelSpeaking = false;
      this._turns++;
      if (this._turnStartAt) {
        console.log(`[Live][timing] ⏱️ full turn ${Math.round(performance.now() - this._turnStartAt)}ms (user start → model done)`);
      }
      this._emit('onTurnComplete', { answer, question });
      this._userTranscript = '';
      this._modelTranscript = '';
      this._turnStartAt = 0;
      this._lastInputAt = 0;
      // Once queued audio drains, we're back to listening.
      this._emit('onListening');
    }
  }

  _sendAudioChunk(int16ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    const b64 = arrayBufferToBase64(int16ArrayBuffer);
    // Current Live API format: realtimeInput.audio (the older mediaChunks array is rejected
    // by newer models like gemini-3.1-flash-live-preview).
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: { mimeType: `audio/pcm;rate=${CAPTURE_SAMPLE_RATE}`, data: b64 },
      },
    }));
  }

  /** Send a typed text turn through the same Live session. */
  sendText(textInput) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: textInput }] }],
        turnComplete: true,
      },
    }));
  }

  _enqueuePcm(b64) {
    const int16 = base64ToInt16Array(b64);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const ctx = this.playbackCtx;
    const buffer = ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now;
    src.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.add(src);
    src.onended = () => this.scheduledSources.delete(src);
  }

  _flushPlayback() {
    for (const src of this.scheduledSources) {
      try { src.onended = null; src.stop(); } catch (e) { /* already stopped */ }
    }
    this.scheduledSources.clear();
    this.nextStartTime = 0;
  }

  _reconnect() {
    if (this.stopped) return;
    if (this.reconnectAttempts >= 3) {
      this._emit('onError', 'Live session lost.');
      return;
    }
    this.reconnectAttempts++;
    console.log(`[Live] reconnecting... (attempt ${this.reconnectAttempts}/3)`);
    setTimeout(() => {
      if (this.stopped) return;
      this._connect().catch((err) => {
        console.error('[Live] reconnect failed:', err);
      });
    }, 600);
  }

  stop() {
    // Emit the billing snapshot before teardown, and only for a session that actually
    // connected — a failed start is not usage. Guarded so repeated stop() calls can't
    // double-count a tenant's minutes.
    if (this.everLive && !this._usageReported) {
      this._usageReported = true;
      const report = this.getUsageReport();
      console.log(`[Live][usage] ${report.connectedMinutes}min | ${report.turns} turns | ${report.totalTokens} tokens | ${report.model}`);
      this._emit('onUsageReport', report);
    }

    this.stopped = true;
    this.setupComplete = false;
    this.modelSpeaking = false;

    this._clearSessionTimers();
    this._flushPlayback();

    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.workletNode) {
      try { this.workletNode.port.onmessage = null; this.workletNode.disconnect(); } catch (e) {}
      this.workletNode = null;
    }
    if (this.captureCtx) {
      try { this.captureCtx.close(); } catch (e) {}
      this.captureCtx = null;
    }
    if (this.playbackCtx) {
      try { this.playbackCtx.close(); } catch (e) {}
      this.playbackCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
  }
}
