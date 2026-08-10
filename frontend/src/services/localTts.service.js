/**
 * LocalTtsPlayer — gapless PCM playback for the offline voice path.
 *
 * Replaces `window.speechSynthesis` for spoken responses. The reason is not voice
 * quality but echo cancellation: SAPI plays out-of-process, so the browser's AEC
 * cannot subtract it from the mic and the assistant transcribes itself. That forced
 * the half-duplex "deaf period" in ClientDashboard. Rendering TTS through WebAudio
 * puts it in the AEC reference signal, which is what makes barge-in possible.
 *
 * Scheduling and flush semantics deliberately mirror GeminiLiveSession's
 * `_enqueuePcm`/`_flushPlayback` so both voice paths behave identically.
 *
 * Audio contract: mono 16-bit signed little-endian PCM at `sampleRate`
 * (Piper `--output_raw` emits exactly this; en_US-lessac-medium is 22050 Hz).
 */

export default class LocalTtsPlayer {
  /**
   * @param {object} opts
   * @param {number} [opts.sampleRate]   Source PCM rate. Must match the TTS model.
   * @param {number} [opts.volume]       0..1 output gain.
   * @param {Function} [opts.onStart]    Fired once when the first chunk begins playing.
   * @param {Function} [opts.onDrained]  Fired when the queue empties after endOfStream().
   * @param {Function} [opts.onAmplitude] Fired ~30x/sec with 0..1 loudness (hologram lipsync).
   */
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 22050;
    this.volume = opts.volume != null ? opts.volume : 1.0;
    this.onStart = opts.onStart || null;
    this.onDrained = opts.onDrained || null;
    this.onAmplitude = opts.onAmplitude || null;

    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.scheduledSources = new Set();
    this.nextStartTime = 0;

    this.started = false;      // first chunk has begun playing
    this.streamEnded = false;  // producer signalled no more chunks
    this.drainedFired = false;
    this._amplitudeRaf = null;
    this._amplitudeBuf = null;
  }

  _ensureContext() {
    if (this.ctx) return;
    // No sampleRate override: let the context run at the device rate and resample
    // per-buffer. Forcing a rate here can silently fail on some Windows audio stacks.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this._amplitudeBuf = new Uint8Array(this.analyser.frequencyBinCount);

    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** True while audio is queued or playing — used to arm barge-in. */
  get isPlaying() {
    return this.scheduledSources.size > 0;
  }

  /**
   * Queue one PCM chunk for gapless playback.
   * @param {ArrayBuffer|Uint8Array} chunk Raw mono int16 LE bytes.
   */
  enqueuePcm(chunk) {
    if (!chunk) return;
    this._ensureContext();

    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    // Guard odd byte counts: a chunk boundary can split a 16-bit sample in half.
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount === 0) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const buffer = this.ctx.createBuffer(1, sampleCount, this.sampleRate);
    buffer.copyToChannel(float32, 0);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now;
    src.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.add(src);
    src.onended = () => {
      this.scheduledSources.delete(src);
      this._maybeDrain();
    };

    if (!this.started) {
      this.started = true;
      this._startAmplitudeLoop();
      if (this.onStart) {
        try { this.onStart(); } catch (e) { console.error('[LocalTTS] onStart threw', e); }
      }
    }
  }

  /** Producer signals no further chunks. Drain fires once playback catches up. */
  endOfStream() {
    this.streamEnded = true;
    this._maybeDrain();
  }

  _maybeDrain() {
    if (!this.streamEnded || this.drainedFired || this.scheduledSources.size > 0) return;
    this.drainedFired = true;
    this._stopAmplitudeLoop();
    if (this.onDrained) {
      try { this.onDrained(); } catch (e) { console.error('[LocalTTS] onDrained threw', e); }
    }
  }

  /**
   * Barge-in: drop everything queued and stop immediately.
   * Suppresses onDrained — the caller decided how this turn ends, not the queue.
   */
  flush() {
    for (const src of this.scheduledSources) {
      try { src.onended = null; src.stop(); } catch (e) { /* already stopped */ }
    }
    this.scheduledSources.clear();
    this.nextStartTime = 0;
    this.drainedFired = true;
    this._stopAmplitudeLoop();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  _startAmplitudeLoop() {
    if (!this.onAmplitude || this._amplitudeRaf) return;
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(this._amplitudeBuf);
      let peak = 0;
      for (let i = 0; i < this._amplitudeBuf.length; i++) {
        const d = Math.abs(this._amplitudeBuf[i] - 128);
        if (d > peak) peak = d;
      }
      try { this.onAmplitude(Math.min(1, peak / 128)); } catch (e) { /* non-fatal */ }
      this._amplitudeRaf = requestAnimationFrame(tick);
    };
    this._amplitudeRaf = requestAnimationFrame(tick);
  }

  _stopAmplitudeLoop() {
    if (this._amplitudeRaf) {
      cancelAnimationFrame(this._amplitudeRaf);
      this._amplitudeRaf = null;
    }
    if (this.onAmplitude) {
      try { this.onAmplitude(0); } catch (e) { /* non-fatal */ }
    }
  }

  /** Reset for the next response without tearing down the AudioContext. */
  reset() {
    this.flush();
    this.started = false;
    this.streamEnded = false;
    this.drainedFired = false;
  }

  async close() {
    this.flush();
    if (this.ctx) {
      try { await this.ctx.close(); } catch (e) { /* already closed */ }
      this.ctx = null;
      this.gain = null;
      this.analyser = null;
    }
  }
}

/**
 * LocalTtsEngine — drives streaming Piper synthesis into a LocalTtsPlayer.
 *
 * The LLM emits clauses one at a time, and each clause is a separate Piper
 * invocation. Synthesis runs serially and feeds a single player, whose
 * `nextStartTime` scheduling stitches the clauses together without gaps.
 * Piper runs faster than real time, so synthesis stays ahead of playback.
 *
 * Availability is not assumed: `isSupported()` is false in a plain browser or on
 * mobile, and callers are expected to fall back to speechSynthesis there.
 */
export class LocalTtsEngine {
  constructor(opts = {}) {
    this.voice = opts.voice || 'en_US-lessac-medium';
    // Callbacks are read through `this` on every invocation, so a long-lived engine can be
    // retargeted at each new response without rebuilding the AudioContext.
    this.onStart = opts.onStart || null;
    this.onDrained = opts.onDrained || null;
    this.onAmplitude = opts.onAmplitude || null;
    this.onError = opts.onError || null;

    this.player = new LocalTtsPlayer({
      volume: opts.volume,
      onStart: () => { if (this.onStart) this.onStart(); },
      onAmplitude: (v) => { if (this.onAmplitude) this.onAmplitude(v); },
      onDrained: () => { if (this.onDrained) this.onDrained(); },
    });

    this.queue = [];
    this.currentStreamId = null;
    this.synthesizing = false;
    this.inputClosed = false;
    this.cancelled = false;
    this._seq = 0;
    this._unsubscribers = [];

    if (LocalTtsEngine.isSupported()) this._subscribe();
  }

  static isSupported() {
    return !!(typeof window !== 'undefined' && window.electronAPI?.piperStreamStart);
  }

  _subscribe() {
    const api = window.electronAPI;
    this._unsubscribers.push(
      api.onPiperStreamChunk(({ streamId, chunk }) => {
        // Late chunks from a superseded stream must not leak into the new response.
        if (this.cancelled || streamId !== this.currentStreamId) return;
        this.player.enqueuePcm(chunk);
      }),
      api.onPiperStreamEnd(({ streamId }) => {
        if (this.cancelled || streamId !== this.currentStreamId) return;
        this.synthesizing = false;
        this.currentStreamId = null;
        this._pump();
      }),
      api.onPiperStreamError(({ streamId, error }) => {
        if (this.cancelled || streamId !== this.currentStreamId) return;
        console.error('[LocalTTS] synthesis failed:', error);
        this.synthesizing = false;
        this.currentStreamId = null;
        if (this.onError) this.onError(error);
        // Keep going — one bad clause shouldn't kill the whole response.
        this._pump();
      })
    );
  }

  /** True while audio is queued or playing — used to arm barge-in. */
  get isPlaying() {
    return this.player.isPlaying || this.synthesizing || this.queue.length > 0;
  }

  /** Queue one clause for synthesis and playback. */
  speak(text) {
    const clean = (text || '').trim();
    if (!clean || this.cancelled) return;
    this.queue.push(clean);
    this._pump();
  }

  /** No further clauses are coming. Drain fires once the tail finishes playing. */
  endOfStream() {
    this.inputClosed = true;
    this._maybeClosePlayer();
  }

  async _pump() {
    if (this.cancelled || this.synthesizing) return;
    if (this.queue.length === 0) {
      this._maybeClosePlayer();
      return;
    }

    const text = this.queue.shift();
    const streamId = `tts-${Date.now()}-${this._seq++}`;
    this.currentStreamId = streamId;
    this.synthesizing = true;

    try {
      const res = await window.electronAPI.piperStreamStart(text, this.voice, streamId);
      if (!res?.success) {
        this.synthesizing = false;
        this.currentStreamId = null;
        if (this.onError) this.onError(res?.error || 'piper-stream-start failed');
        this._pump();
        return;
      }
      // The model dictates playback pitch; trust the value main.js read from its config.
      if (res.sampleRate) this.player.sampleRate = res.sampleRate;
    } catch (err) {
      this.synthesizing = false;
      this.currentStreamId = null;
      if (this.onError) this.onError(err.message);
      this._pump();
    }
  }

  _maybeClosePlayer() {
    if (this.inputClosed && !this.synthesizing && this.queue.length === 0) {
      this.player.endOfStream();
    }
  }

  /** Barge-in: stop speaking now, kill in-flight synthesis, drop the backlog. */
  cancel() {
    this.cancelled = true;
    this.queue = [];
    this.player.flush();
    if (this.currentStreamId && window.electronAPI?.piperStreamCancel) {
      window.electronAPI.piperStreamCancel(this.currentStreamId).catch(() => {});
    }
    this.currentStreamId = null;
    this.synthesizing = false;
  }

  setVolume(v) { this.player.setVolume(v); }

  /**
   * Prepare for a new response, reusing the AudioContext and IPC subscriptions.
   * Cheaper and more reliable than building a fresh engine per turn — browsers cap
   * the number of concurrent AudioContexts.
   */
  reset() {
    this.queue = [];
    this.cancelled = false;
    this.inputClosed = false;
    this.synthesizing = false;
    this.currentStreamId = null;
    this.player.reset();
  }

  async dispose() {
    this.cancel();
    this._unsubscribers.forEach((fn) => { try { fn(); } catch (e) { /* already gone */ } });
    this._unsubscribers = [];
    await this.player.close();
  }
}
