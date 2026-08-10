/**
 * OpenAIRealtimeSession — real-time, full-duplex voice session with the OpenAI Realtime API.
 *
 * Replaces separate STT -> LLM -> TTS steps with a single bidirectional WebSocket connection.
 * Supports native speech-to-speech, continuous listening, low latency response,
 * server-side VAD barge-in (interruption handling), and tool/function calling for kiosk features.
 *
 * Audio contract:
 *   - mic in : 24 kHz or 16 kHz mono 16-bit PCM
 *   - out    : 24 kHz mono 16-bit PCM, gapless WebAudio playback
 */

export const DEFAULT_OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
export const DEFAULT_OPENAI_REALTIME_VOICE = 'alloy';

export const OPENAI_REALTIME_VOICES = [
  { id: 'alloy', label: 'Alloy (Neutral, Balanced)' },
  { id: 'echo', label: 'Echo (Male, Deep & Resonant)' },
  { id: 'shimmer', label: 'Shimmer (Female, Bright & Energetic)' },
  { id: 'coral', label: 'Coral (Female, Warm & Friendly)' },
  { id: 'verse', label: 'Verse (Male, Versatile & Expressive)' },
  { id: 'ballad', label: 'Ballad (Male, Melodic & Smooth)' },
  { id: 'ash', label: 'Ash (Male, Clear & Precise)' },
  { id: 'sage', label: 'Sage (Female, Calm & Thoughtful)' },
  { id: 'marin', label: 'Marin (Female, Natural & Professional)' },
  { id: 'cedar', label: 'Cedar (Male, Deep & Conversational)' }
];

const CAPTURE_SAMPLE_RATE = 24000;
const PLAYBACK_SAMPLE_RATE = 24000;

// AudioWorklet processor for PCM capture
const CAPTURE_WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 2400; // ~100ms at 24kHz
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
registerProcessor('pcm-capture-processor-openai', PCMCaptureProcessor);
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

export default class OpenAIRealtimeSession {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey OpenAI API key
   * @param {string} [opts.model] Model name (e.g. gpt-4o-realtime-preview)
   * @param {string} [opts.voice] Prebuilt voice (alloy, echo, shimmer, coral, etc.)
   * @param {string} [opts.systemInstruction] Persona / system prompt
   * @param {Array} [opts.functionDeclarations] Tools available for execution
   * @param {object} [opts.callbacks] Event hooks
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.model || DEFAULT_OPENAI_REALTIME_MODEL;
    this.voice = opts.voice || DEFAULT_OPENAI_REALTIME_VOICE;
    this.systemInstruction = opts.systemInstruction || '';
    this.audioConstraints = opts.audioConstraints || { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    this.functionDeclarations = opts.functionDeclarations || [];
    this.cb = opts.callbacks || {};

    this.ws = null;
    this.micStream = null;
    this.captureCtx = null;
    this.workletNode = null;
    this.workletUrl = null;

    this.playbackCtx = null;
    this.scheduledSources = new Set();
    this.nextStartTime = 0;

    this.stopped = false;
    this.setupComplete = false;
    this.everLive = false;
    this.modelSpeaking = false;
    this._userTranscript = '';
    this._modelTranscript = '';
    this._turns = 0;
  }

  _emit(name, arg) {
    try {
      if (this.cb[name]) this.cb[name](arg);
    } catch (e) {
      console.error(`[OpenAIRealtime] callback ${name} error:`, e);
    }
  }

  async start() {
    if (!this.apiKey) {
      this._emit('onError', 'OpenAI API key is missing.');
      return false;
    }
    this.stopped = false;
    try {
      await this._openMic();
      this._openPlayback();
      await this._connect();
      return true;
    } catch (err) {
      console.error('[OpenAIRealtime] start failed:', err);
      this._emit('onError', err.message || String(err));
      this.stop();
      return false;
    }
  }

  async _openMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints });
    this.captureCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: CAPTURE_SAMPLE_RATE });
    if (this.captureCtx.state === 'suspended') await this.captureCtx.resume();

    const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
    this.workletUrl = URL.createObjectURL(blob);
    await this.captureCtx.audioWorklet.addModule(this.workletUrl);

    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.captureCtx, 'pcm-capture-processor-openai');
    this.workletNode.port.onmessage = (e) => this._sendAudioChunk(e.data);
    source.connect(this.workletNode);
  }

  _openPlayback() {
    this.playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.nextStartTime = 0;
  }

  _connect() {
    return new Promise(async (resolve, reject) => {
      let settled = false;
      let ephemeralKey;
      try {
        const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session: {
              type: 'realtime',
              model: this.model,
              audio: {
                output: {
                  voice: this.voice
                }
              }
            }
          })
        });
        if (!response.ok) {
           const errorText = await response.text();
           throw new Error(`${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        ephemeralKey = data.client_secret?.value || data.value;
        if (!ephemeralKey) {
           throw new Error("Could not find ephemeral token in API response: " + JSON.stringify(data));
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e);
        }
        this._emit('onError', 'Realtime authentication error: ' + e.message);
        return;
      }

      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;
      
      // Pass ephemeral token via subprotocol header for browser WebSocket
      const protocols = ['realtime', `openai-insecure-api-key.${ephemeralKey}`];
      const ws = new WebSocket(url, protocols);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[OpenAIRealtime] WebSocket connected. Updating session...');
        this._sendSessionUpdate();
      };

      ws.onmessage = async (event) => {
        const handled = await this._handleServerMessage(event.data);
        if (handled === 'setup' && !settled) {
          settled = true;
          resolve(true);
        }
      };

      ws.onerror = (e) => {
        console.error('[OpenAIRealtime] WebSocket error:', e);
        if (!settled) {
          settled = true;
          reject(new Error('OpenAI Realtime WebSocket connection failed'));
        }
        this._emit('onError', 'Realtime connection error');
      };

      ws.onclose = (e) => {
        console.log(`[OpenAIRealtime] WebSocket closed (${e.code}): ${e.reason || ''}`);
        this.setupComplete = false;
        if (this.stopped) {
          this._emit('onClose');
          return;
        }
        if (!this.everLive) {
          this._emit('onError', e.reason || `Connection rejected (code ${e.code})`);
          return;
        }
      };
    });
  }

  _sendSessionUpdate() {
    // Format OpenAI tool schemas
    const formattedTools = this.functionDeclarations.map(fn => ({
      type: 'function',
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    }));

    const sessionEvent = {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.systemInstruction,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600
            }
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: this.voice
          }
        },
        tools: formattedTools
      }
    };

    this.ws.send(JSON.stringify(sessionEvent));
  }

  async _handleServerMessage(data) {
    let text;
    if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (data instanceof Blob) text = await data.text();
    else text = data;

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return null;
    }

    const type = msg.type;

    if (type === 'session.created' || type === 'session.updated') {
      if (!this.setupComplete) {
        this.setupComplete = true;
        this.everLive = true;
        console.log('[OpenAIRealtime] Session ready & live');
        this._emit('onOpen');
        this._emit('onListening');
        return 'setup';
      }
      return null;
    }

    // User speech started (Server VAD Barge-In)
    if (type === 'input_audio_buffer.speech_started') {
      console.log('[OpenAIRealtime] User speech started - barge-in triggered');
      this._flushPlayback();
      this.modelSpeaking = false;
      this._userTranscript = '';
      this._modelTranscript = '';
      this._emit('onInterrupted');
      this._emit('onListening');
      return null;
    }

    // Model speech transcript
    if (type === 'response.audio_transcript.delta' || type === 'response.output_audio_transcript.delta') {
      const delta = msg.delta || '';
      if (delta) {
        this._modelTranscript += delta;
        this._emit('onModelTranscript', this._modelTranscript.trim());
      }
      return null;
    }

    // User transcribed input
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = msg.transcript || '';
      if (transcript) {
        this._userTranscript = transcript;
        this._emit('onUserTranscript', this._userTranscript.trim());
      }
      return null;
    }

    // Model audio chunk
    if (type === 'response.audio.delta' || type === 'response.output_audio.delta') {
      const delta = msg.delta;
      if (delta) {
        if (!this.modelSpeaking) {
          this.modelSpeaking = true;
          this._emit('onModelAudioStart');
        }
        this._enqueuePcm(delta);
      }
      return null;
    }

    // Tool / Function Calls
    if (type === 'response.function_call_arguments.done') {
      const { call_id, name, arguments: argsStr } = msg;
      let parsedArgs = {};
      try { parsedArgs = JSON.parse(argsStr); } catch (e) {}

      this._emit('onToolCall', [{
        id: call_id,
        name: name,
        args: parsedArgs
      }]);
      return null;
    }

    // Response done
    if (type === 'response.done') {
      const answer = this._modelTranscript.trim();
      const question = this._userTranscript.trim();
      this.modelSpeaking = false;
      this._turns++;

      this._emit('onTurnComplete', { answer, question });
      this._userTranscript = '';
      this._modelTranscript = '';
      this._emit('onListening');
      return null;
    }

    if (type === 'error') {
      console.error('[OpenAIRealtime] Server error event:', msg.error);
      this._emit('onError', msg.error?.message || 'OpenAI Realtime error');
    }

    return null;
  }

  sendToolResponse(functionResponses) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    for (const res of functionResponses) {
      const itemEvent = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: res.id,
          output: JSON.stringify(res.response || { success: true })
        }
      };
      this.ws.send(JSON.stringify(itemEvent));
    }

    // Trigger next turn
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  _sendAudioChunk(int16ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    const b64 = arrayBufferToBase64(int16ArrayBuffer);
    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: b64
    }));
  }

  sendText(textInput) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: textInput }]
      }
    }));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
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
      try { src.onended = null; src.stop(); } catch (e) {}
    }
    this.scheduledSources.clear();
    this.nextStartTime = 0;
  }

  stop() {
    this.stopped = true;
    this.setupComplete = false;
    this.modelSpeaking = false;

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
