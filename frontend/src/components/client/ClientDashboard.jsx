import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import SubscriptionStatus from '../dashboard/SubscriptionStatus';
import ModuleSelector from '../dashboard/ModuleSelector';
import VideoManagement from './VideoManagement';
import QAManagement from './QAManagement';
import AISystemInstructions from './AISystemInstructions';
import VoiceSettings from './VoiceSettings';
import { isElectron } from '../../utils/electron';
import DownloadPortal from './DownloadPortal';
import GeminiLiveSession, { DEFAULT_LIVE_MODEL, DEFAULT_LIVE_VOICE } from '../../services/geminiLive.service';
import OpenAIRealtimeSession, { DEFAULT_OPENAI_REALTIME_MODEL, DEFAULT_OPENAI_REALTIME_VOICE } from '../../services/openAIRealtime.service';
import { LocalTtsEngine } from '../../services/localTts.service';
import { FaRobot, FaVideo, FaQuestionCircle, FaVolumeUp, FaMicrophone, FaStop, FaPenNib, FaHandPaper, FaSignOutAlt, FaMicrochip, FaSdCard, FaExclamationTriangle, FaCheckCircle, FaInfoCircle, FaServer, FaHeadset, FaPhoneAlt, FaEnvelope, FaDownload } from 'react-icons/fa';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';

// Enhanced constraints applied to every getUserMedia call across all voice capture modes.
// { ideal: true } lets the browser negotiate the best available hardware processing.
// channelCount: 1 forces mono — halves processing load and matches Whisper's expected input.
const AUDIO_CONSTRAINTS = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: 1,
};

// Full-duplex offline voice. Renders TTS through WebAudio (Piper raw PCM) instead of
// out-of-process SAPI, so the browser's echo canceller can subtract the assistant's own
// voice from the mic. That is what allows the mic to stay open while speaking, which is
// what allows barge-in. With this off, the legacy half-duplex path runs unchanged.
//
// Default OFF: echo behaviour depends on the kiosk's speakers and volume, so this is
// opted into per-device after verifying the assistant doesn't hear itself.
const isFullDuplexEnabled = () => {
  try {
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    return vs.fullDuplex === true && LocalTtsEngine.isSupported();
  } catch (e) {
    return false;
  }
};

// Piper voice used for full-duplex playback. Falls back to the bundled US voice.
const getFullDuplexVoice = () => {
  try {
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    return vs.piperVoice || 'en_US-lessac-medium';
  } catch (e) {
    return 'en_US-lessac-medium';
  }
};

const ClientDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('modules');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [localIp, setLocalIp] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isAIBusy, setIsAIBusy] = useState(false);
  const isDesktop = isElectron();
  
  const { activeModule, loadModule, processQuestion, getModuleInstance } = useModule();
  const audioCtxRef = useRef(null);
  const watchdogRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const monitorStreamRef = useRef(null);
  const monitorIntervalRef = useRef(null);
  const isRecordingRef = useRef(false);
  const pipelineStartRef = useRef(null); // Timer: when mic was muted
  const handsFreeStreamRef = useRef(null); // Mic stream for hands-free recording
  const handsFreeAnalyserRef = useRef(null); // Audio context for hands-free
  const handsFreeActiveRef = useRef(false); // Cancellation flag for hands-free mode
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false); // Mute-button: Waiting for unmute
  const [isWakeWordListening, setIsWakeWordListening] = useState(false); // Hands-free: Waiting for speech
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const [showSupportTooltip, setShowSupportTooltip] = useState(false);
  const [isOllamaReady, setIsOllamaReady] = useState(true);
  const [geminiKeySet, setGeminiKeySet] = useState(!!localStorage.getItem('gemini_api_key'));
  const [isPTTRecording, setIsPTTRecording] = useState(false);
  const pttMediaRecorderRef = useRef(null);
  const pttChunksRef = useRef([]);
  const handleInteractionRequestRef = useRef(null);
  const webSpeechRecognitionRef = useRef(null);
  const activeModuleRef = useRef(null);
  const wakeWordCooldownRef = useRef(false);
  const offlineVADRef = useRef(null);
  const rnnoiseAudioCtxRef = useRef(null); // keeps RNNoise AudioContext alive while VAD runs
  const lastAnswerRef = useRef(null);
  const vadPhaseRef = useRef('wake'); // 'wake' | 'question' — routes onSpeechEnd to correct handler
  const vadQuestionHandlerRef = useRef(null); // set by startWhisperQuestion, called by VAD onSpeechEnd
  const vadDeafUntilRef = useRef(0); // epoch ms — speech-end callbacks before this timestamp are discarded
  const systemAudioPlayRef = useRef(null); // { start, end }
  const speechStartTimestampRef = useRef(null);
  const localTtsRef = useRef(null);          // active LocalTtsEngine (offline full-duplex TTS)
  const bargeInArmedRef = useRef(false);     // true while the assistant speaks and may be interrupted
  const bargeInTurnRef = useRef(false);      // true once barge-in has taken ownership of this turn
  const geminiLiveRef = useRef(null);        // active GeminiLiveSession (online real-time mode)
  const openAIRealtimeRef = useRef(null);     // active OpenAIRealtimeSession (online real-time mode)
  const liveActiveRef = useRef(false);       // true while a Live call is running
  const liveToolVideoRef = useRef(false);    // true while a user-requested content video plays (via tool)

  useEffect(() => {
    if (window.electronAPI?.getSystemSpecs) {
      window.electronAPI.getSystemSpecs().then(result => {
        if (result.success) setSystemSpecs(result.specs);
      });
    }

    // Initialize Default Persona: Ram
    const savedInstructions = localStorage.getItem('ai_system_instructions');
    if (!savedInstructions) {
      console.log('[Dashboard] Initializing Default Persona: Ram');
      const ramPersona = "You are a helpful, professional AI assistant. your name is Ram. Keep your responses concise and direct. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis, as your responses will be read aloud. i want only 10 words of response not even 11 in brief in short.";
      localStorage.setItem('ai_system_instructions', ramPersona);
    }
  }, []);

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    const checkFirstRunOllama = async () => {
      const models = user?.models || [];
      const hasGemmaPermission = models.includes('gemma') || user?.role === 'superadmin';
      
      if (hasGemmaPermission) {
        const checked = localStorage.getItem('ollama_first_run_checked');
        if (!checked) {
          console.log('[Dashboard] First run offline check — verifying Ollama connection...');
          if (window.electronAPI && window.electronAPI.ollamaVerify) {
            try {
              const verifyResult = await window.electronAPI.ollamaVerify();
              if (!verifyResult.success || !verifyResult.connected || !verifyResult.models || verifyResult.models.length === 0) {
                console.log('[Dashboard] Ollama setup is missing or incomplete. Redirecting to setup wizard.');
                localStorage.setItem('ollama_first_run_checked', 'true');
                setActiveTab('modules');
                localStorage.setItem('trigger_ollama_setup', 'true');
              } else {
                console.log('[Dashboard] Ollama verification succeeded.');
                localStorage.setItem('ollama_first_run_checked', 'true');
              }
            } catch (e) {
              console.warn('[Dashboard] Ollama verify error:', e);
            }
          }
        }
      }
    };
    checkFirstRunOllama();
  }, [user]);

  useEffect(() => {
    const checkOllamaStatus = async () => {
      const models = user?.models || [];
      const hasGemmaPermission = models.includes('gemma') || user?.role === 'superadmin';
      if (hasGemmaPermission && window.electronAPI?.ollamaVerify) {
        try {
          const verifyResult = await window.electronAPI.ollamaVerify();
          const ready = !!(verifyResult.success && verifyResult.connected && verifyResult.models && verifyResult.models.length > 0);
          setIsOllamaReady(ready);
        } catch (e) {
          setIsOllamaReady(false);
        }
      } else {
        setIsOllamaReady(true);
      }
    };
    checkOllamaStatus();
    const interval = setInterval(checkOllamaStatus, 10000);

    // Keep the Cloud AI Brain key in sync — saved in Settings, cleared elsewhere
    const syncGeminiKey = () => setGeminiKeySet(!!localStorage.getItem('gemini_api_key'));
    syncGeminiKey();
    window.addEventListener('gemini-key-updated', syncGeminiKey);
    window.addEventListener('storage', syncGeminiKey);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gemini-key-updated', syncGeminiKey);
      window.removeEventListener('storage', syncGeminiKey);
    };
  }, [user, activeTab]);

  const getPerformanceRating = (specs) => {
    if (!specs) return { label: 'Analyzing...', color: 'text-gray-400', bg: 'bg-gray-100', icon: <FaMicrochip /> };
    
    const { coreCount, totalRAM } = specs;
    
    if (coreCount >= 12 && totalRAM >= 16) return { label: 'Elite Device', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <FaCheckCircle />, status: 'high' };
    if (coreCount >= 8 && totalRAM >= 8) return { label: 'High Performance', color: 'text-blue-600', bg: 'bg-blue-50', icon: <FaCheckCircle />, status: 'high' };
    if (coreCount >= 4 && totalRAM >= 8) return { label: 'Optimal', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: <FaCheckCircle />, status: 'medium' };
    
    return { label: 'Low Power mode', color: 'text-amber-600', bg: 'bg-amber-50', icon: <FaExclamationTriangle />, status: 'low' };
  };

  const performanceRating = getPerformanceRating(systemSpecs);

  const resetBusyState = (source = 'unknown') => {
    console.log(`[Dashboard] Resetting Busy State (Source: ${source})`);
    setIsAIBusy(false);
    if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
    }
  };

  /**
   * Barge-in — the user started talking while the assistant was speaking.
   * Stops playback, kills in-flight synthesis and generation, and treats the
   * interrupting utterance as the next question (same behaviour as Gemini Live).
   *
   * Only reachable in full-duplex mode; the legacy path deafens the mic while speaking.
   * @returns {boolean} true if an interruption was actually handled
   */
  const handleBargeIn = () => {
    if (!bargeInArmedRef.current) return false;
    bargeInArmedRef.current = false;
    // Claims this turn: the in-flight response must not also run its own cleanup.
    bargeInTurnRef.current = true;
    console.log('[Dashboard] 🙋 Barge-in — user interrupted the assistant');

    // 1. Stop speaking immediately and kill the Piper process mid-sentence.
    localTtsRef.current?.cancel();

    // 2. Stop the model so a stale answer can't arrive and talk over the user.
    try {
      const gemma = getModuleInstance('gemma');
      if (gemma?.abort) gemma.abort();
    } catch (e) { /* module not loaded */ }

    window.electronAPI?.stopHologramVideo();
    resetBusyState('barge_in');

    // 3. Hand the turn straight back — the words being spoken now are the next question.
    //    AEC (not a deaf window) is what keeps our own voice out of this capture, so the
    //    deaf timer is cleared rather than re-armed.
    vadDeafUntilRef.current = 0;
    vadPhaseRef.current = 'question';
    // Route to the listener this mode actually uses — the two modes install different
    // capture handlers, and starting the wrong one leaves the question uncaptured.
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    if (vs.handsFreeMode) startQuestionRecording(false);
    else startMuteButtonVAD(0);
    return true;
  };

  const startThinkingVideo = () => {
      const processingId = localStorage.getItem('processing_video');
      if (processingId && window.electronAPI?.playHologramVideo) {
          const storedVideos = JSON.parse(localStorage.getItem('videos') || '[]');
          const pVideo = storedVideos.find(v => v.id == processingId);
          if (pVideo) {
              console.log('[Dashboard] 🎬 Playing THINKING video...');
              window.electronAPI.playHologramVideo(pVideo);
          }
      }
  };

  const playVoiceGuide = (type) => {
    try {
        const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
        if (!voiceSettings.voiceGuide) return;

        let sentence = "";
        switch (type) {
            case 'start': sentence = "I am listening."; break;
            case 'stop': sentence = "Question captured."; break;
            case 'cancel': sentence = "Stopped."; break;
            case 'analog_boot': sentence = "System ready."; break;
            case 'tickle': sentence = "Yes? How can I help?"; break;
            case 'processing': sentence = "Processing."; break;
            case 'process_p1': sentence = "One moment, processing."; break;
            default: return;
        }

        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(sentence);
        utter.onstart = () => {
            systemAudioPlayRef.current = { start: performance.now(), end: null };
        };
        utter.onend = () => {
            if (systemAudioPlayRef.current) systemAudioPlayRef.current.end = performance.now();
        };
        utter.onerror = () => {
            if (systemAudioPlayRef.current) systemAudioPlayRef.current.end = performance.now();
        };
        
        // Apply user preferences
        if (voiceSettings.voice) {
            const selected = window.speechSynthesis.getVoices().find(v => v.name === voiceSettings.voice);
            if (selected) utter.voice = selected;
        }
        utter.pitch = voiceSettings.pitch || 1.1;
        utter.rate = voiceSettings.rate || 1.0;
        utter.volume = voiceSettings.volume || 1.0;

        window.speechSynthesis.speak(utter);
    } catch (e) { console.error('[VoiceGuide] Error:', e); }
  };

  // Async version for use before starting VAD — resolves only when audio is fully done.
  // Voice guide: resolves on utter.onend so VAD starts AFTER TTS speech finishes.
  // Beep: resolves after 1000ms (long enough for the oscillator beep to complete).
  // Prevents TTS feedback loop where VAD captures its own voice guide.
  const playBeepAsync = (type) => new Promise((resolve) => {
    console.log(`[Audio] 🔊 (async) synthesize audio requested: ${type}`);
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    if (vs.voiceGuide) {
      let sentence = '';
      switch (type) {
        case 'start': sentence = 'I am listening.'; break;
        case 'stop': sentence = 'Question captured.'; break;
        case 'cancel': sentence = 'Stopped.'; break;
        case 'analog_boot': sentence = 'System ready.'; break;
        case 'tickle': sentence = 'Yes? How can I help?'; break;
        case 'process_p1': sentence = 'One moment, processing.'; break;
        default: resolve(); return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(sentence);
      utter.onstart = () => {
          systemAudioPlayRef.current = { start: performance.now(), end: null };
      };
      const voice = window.speechSynthesis.getVoices().find(v => v.name === vs.voice);
      if (voice) utter.voice = voice;
      utter.pitch = vs.pitch || 1.1;
      utter.rate = vs.rate || 1.0;
      utter.volume = vs.volume || 1.0;
      utter.onend = () => {
          if (systemAudioPlayRef.current) systemAudioPlayRef.current.end = performance.now();
          resolve();
      };
      utter.onerror = () => {
          if (systemAudioPlayRef.current) systemAudioPlayRef.current.end = performance.now();
          resolve();
      };
      setTimeout(resolve, 6000); // failsafe — if onend never fires, unblock after 6s
      window.speechSynthesis.speak(utter);
    } else {
      playBeep(type);
      setTimeout(resolve, 1000); // beep lasts ~500ms; 1s covers it plus a small margin
    }
  });

  const playBeep = (type) => {
    console.log(`[Audio] 🔊 synthesize audio requested: ${type}`);
    if (type === 'stop') console.trace('[Audio] stop — call stack');
    
    // If Voice Guide is ON, speak the sentence instead of beeping
    const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    if (voiceSettings.voiceGuide) {
        playVoiceGuide(type);
        return;
    }

    let duration = 200;
    if (type === 'analog_boot') duration = 500;
    else if (type === 'tickle') duration = 300;
    systemAudioPlayRef.current = { start: performance.now(), end: performance.now() + duration };

    try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'start') {
            // High Ping
            osc.frequency.setValueAtTime(880, now); // A5
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1); // E6
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'analog_boot') {
            // Mechanical power-up hum (Completely different from Ping)
            osc.type = 'sawtooth';
            
            // Low sweeping growl
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.4);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.1); // Sawtooth is loud, keep gain low
            gain.gain.setValueAtTime(0.1, now + 0.3);
            gain.gain.linearRampToValueAtTime(0, now + 0.5); // long mechanical fade
            
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (type === 'process_p1') {
            // Subtle Double-Blip (Processing Phase 1 audio)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.setValueAtTime(800, now + 0.1); // jump up
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.1); // dip
            gain.gain.linearRampToValueAtTime(0.15, now + 0.15); // rise
            gain.gain.linearRampToValueAtTime(0, now + 0.2); // fade
            
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'tickle') {
            // Distinctive Retro Trill (Wake Word Matched!)
            osc.type = 'square'; // Very distinct synth sound
            
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.setValueAtTime(1200, now + 0.05);
            osc.frequency.setValueAtTime(800, now + 0.1);
            osc.frequency.setValueAtTime(1200, now + 0.15);
            osc.frequency.setValueAtTime(1600, now + 0.2); // high pop finish
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.05); // Lower volume because square waves are LOUD
            gain.gain.setValueAtTime(0.1, now + 0.2);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'cancel') {
            // Distinct descending tone for manual cancel/stop
            osc.frequency.setValueAtTime(330, now); // E4
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.15); // A3
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else {
            // Low Pong (Stop)
            osc.frequency.setValueAtTime(440, now); // A4
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.1); // A3
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) { console.warn('Audio Cue Error:', e); }
  };

  useEffect(() => {
    if (isDesktop && window.electronAPI && window.electronAPI.getLocalIP) {
        window.electronAPI.getLocalIP().then(ip => {
            setLocalIp(ip);
        }).catch(err => console.error('[Dashboard] Failed to get IP:', err));
    }
  }, [isDesktop]);
  
  useEffect(() => {
    let mounted = true;
    let retryTimer = null;

    const syncSession = async () => {
      if (!user || !window.electronAPI || !window.electronAPI.setUserSession) return;
      
      try {
        const sessionPayload = {
          email: user.email,
          role: user.role,
          expiryDate: localStorage.getItem('expiry_date') || null,
          models: user.models || []
        };
        const result = await window.electronAPI.setUserSession(sessionPayload);
        if (!result?.success && mounted) {
          retryTimer = setTimeout(syncSession, 5000);
        }
      } catch (error) {
        if (mounted) retryTimer = setTimeout(syncSession, 5000);
      }
    };

    syncSession();
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user]);

  // Shared response logic (Video + TTS)
  const handleDesktopActions = async (answer, inputType) => {
    try {
        const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
        const mode = voiceSettings.interactionMode || 'adaptive';
        let shouldSpeak = (mode === 'always_speak') || (mode === 'adaptive' && inputType === 'voice');

        const storedVideos = JSON.parse(localStorage.getItem('videos') || '[]');
        const primaryId = localStorage.getItem('primary_video');
        const primaryVideo = storedVideos.find(v => v.id == primaryId);

        // Helper: switch from thinking video to primary video at exact TTS start
        const startPrimaryVideo = () => {
            if (primaryVideo && window.electronAPI?.playHologramVideo) {
                console.log('[Dashboard] 🎬 Switching to PRIMARY video (TTS started)');
                window.electronAPI.playHologramVideo(primaryVideo);
            }
        };

        if (shouldSpeak) {
            setIsAIBusy(true);
            
            // Watchdog: Force reset after 30 seconds if speechSynthesis onend never fires
            if (watchdogRef.current) clearTimeout(watchdogRef.current);
            watchdogRef.current = setTimeout(() => {
                console.warn('[Dashboard] Watchdog Reset: AI was busy for too long.');
                resetBusyState('watchdog');
            }, 30000);

            window.speechSynthesis.cancel();
            const isPiperVoice = voiceSettings.voice?.includes('lessac') || voiceSettings.voice?.includes('kusal') || voiceSettings.voice?.startsWith('Piper');
            const cleaned = cleanTextForTTS(answer);

            let finishedSpeaking = false;
            const onFinishedSpeaking = () => {
                // Reachable from onended, onerror and the play() rejection — guard so the
                // mic is only reopened once per response.
                if (finishedSpeaking) return;
                finishedSpeaking = true;
                // Stop the hologram video immediately when TTS stops
                console.log('[Dashboard] 🎬 Stopping PRIMARY video (TTS ended)');
                window.electronAPI?.stopHologramVideo();

                // Wait for echo to dissipate before listening again
                setTimeout(() => {
                    if (pipelineStartRef.current) {
                        const totalTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
                        console.log(`[⏱️ TIMER] TTS finished speaking`);
                        console.log(`[⏱️ TIMER] ═══ TOTAL PIPELINE: ${totalTime}s ═══`);
                        pipelineStartRef.current = null;
                    }
                    resetBusyState('tts_finished');
                    // Auto-restart: use correct mode
                    autoRestartListening();
                }, 800);
            };

            if (isPiperVoice && window.electronAPI?.generateSpeech) {
                const res = await window.electronAPI.generateSpeech(cleaned, voiceSettings.voice);
                if (res.success && res.audioPath) {
                    const audio = new Audio(`file://${res.audioPath}`);
                    if (voiceSettings.volume) audio.volume = Math.min(voiceSettings.volume, 1.0);
                    audio.onplaying = startPrimaryVideo; // Switch to primary at exact playback start
                    audio.onended = onFinishedSpeaking;
                    // A decode failure fires onerror without ever firing onended. Route it to the
                    // same cleanup, otherwise the kiosk stays busy and the mic never reopens.
                    audio.onerror = () => {
                        console.error('[Piper] Audio decode/playback failed — cleaning up');
                        onFinishedSpeaking();
                    };
                    audio.play().catch((err) => {
                        console.error('[Piper] play() rejected:', err);
                        onFinishedSpeaking();
                    });
                    return;
                }
            }
            
            const utter = new SpeechSynthesisUtterance(cleaned);
            utter.onstart = startPrimaryVideo; // Switch to primary at exact speech start
            utter.onend = onFinishedSpeaking;
            if (voiceSettings.voice) {
                const selected = window.speechSynthesis.getVoices().find(v => v.name === voiceSettings.voice);
                if (selected) utter.voice = selected;
            }
            window.speechSynthesis.speak(utter);
        } else {
            resetBusyState('no_speech_needed');
            setTimeout(() => {
                window.electronAPI?.stopHologramVideo();
                // Auto-restart: use correct mode
                autoRestartListening();
            }, 5000);
        }
    } catch (e) {
        console.warn('Action Error:', e);
    }
  };

  const cleanTextForTTS = (text) => {
    if (!text) return '';
    // Strip bold/italic markdown symbols like * and _
    // Also remove common AI markdown headers and horizontal rules
    return text
        .replace(/[*_~`]/g, '') // Remove * _ ~ `
        .replace(/#+\s/g, '')   // Remove headers like # or ## 
        .replace(/-{3,}/g, '')  // Remove horizontal rules ---
        .replace(/\n\s*\n/g, '. ') // Replace double newlines with a period and space for natural pause
        .trim();
  };

  // === MUTE-BUTTON FALLBACK: Amplitude — only used if both Web Speech and VAD are unavailable ===
  const startMuteButtonAmplitude = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      monitorStreamRef.current = stream;
      const monitorCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = monitorCtx.createMediaStreamSource(stream);
      const analyser = monitorCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceFrames = 0, speechFrames = 0, hasSpoken = false;
      const UNMUTE_THRESHOLD = 15, MIN_SPEECH_FRAMES = 5;
      const IDLE_FRAMES_TO_STOP = 50, MUTE_FRAMES_TO_STOP = 10;
      const monitorStartTime = performance.now();
      monitorIntervalRef.current = setInterval(() => {
        if (performance.now() - monitorStartTime < 1500) return;
        analyser.getByteFrequencyData(dataArray);
        const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (!isRecordingRef.current) {
          if (avgLevel > UNMUTE_THRESHOLD) {
            console.log(`[Dashboard] 🔴 Mic UNMUTED (level: ${avgLevel.toFixed(1)}) — Recording!`);
            audioChunksRef.current = [];
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.onstop = async () => {
              if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
              monitorIntervalRef.current = null;
              monitorStreamRef.current?.getTracks().forEach(t => t.stop());
              monitorStreamRef.current = null;
              monitorCtx.close();
              setIsListening(false);
              setIsMonitoring(false);
              await transcribeAndSend();
            };
            mediaRecorderRef.current = mr;
            mr.start(250);
            isRecordingRef.current = true;
            silenceFrames = 0; speechFrames = 1; hasSpoken = false;
            setIsListening(true);
            setIsMonitoring(false);
          }
        } else {
          if (avgLevel > UNMUTE_THRESHOLD) {
            speechFrames++;
            silenceFrames = 0;
            if (speechFrames >= MIN_SPEECH_FRAMES) hasSpoken = true;
          } else {
            silenceFrames++;
            const timeout = hasSpoken ? MUTE_FRAMES_TO_STOP : IDLE_FRAMES_TO_STOP;
            if (silenceFrames >= timeout) {
              playBeep('stop');
              isRecordingRef.current = false;
              if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
            }
          }
        }
      }, 100);
    } catch (err) {
      console.error('[Dashboard] Microphone access denied:', err);
      alert('Microphone access denied. Please allow microphone access in your system settings.');
    }
  };

  // === MUTE-BUTTON ONLINE: Web Speech — stops on isFinal, no silence waiting, no feedback loop ===
  // retryCount: increments on each recoverable error retry. Resets to 0 on clean restarts
  // (no-speech timeout, auto-restart after AI response). Caps at 3 to prevent infinite loops
  // when the network error is persistent (e.g. Electron file:// CSP or no internet).
  const startMuteButtonWebSpeech = (retryCount = 0) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { startMuteButtonAmplitude(); return; }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    webSpeechRecognitionRef.current = recognition;

    console.log(`[MuteButton][WebSpeech] 🟢 Listening — speak your question... (attempt ${retryCount + 1})`);
    let done = false;

    const finish = (transcript) => {
      if (done) return;
      done = true;
      try { recognition.abort(); } catch(e) {}
      webSpeechRecognitionRef.current = null;
      setIsMonitoring(false);
      setIsListening(false);
      if (!transcript?.trim()) {
        // No speech captured — keep assistant alive and restart monitoring.
        // Same behaviour as VAD 15s timeout: user didn't say anything, not a reason to stop.
        if (handsFreeActiveRef.current) {
          console.log('[MuteButton][WebSpeech] No speech captured — restarting monitor...');
          setIsMonitoring(true);
          setTimeout(() => startMuteButtonWebSpeech(0), 300); // clean restart, reset retry count
        }
        return;
      }
      playBeep('stop');
      startThinkingVideo();
      pipelineStartRef.current = performance.now();
      handleInteractionRequestRef.current({ requestId: `mb-${Date.now()}`, question: transcript.trim(), inputType: 'voice' });
    };

    recognition.onresult = (e) => {
      if (!handsFreeActiveRef.current) return;
      setIsListening(true);
      setIsMonitoring(false);
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const conf = e.results[i][0].confidence;
        if (conf < 0.5) continue;
        const t = e.results[i][0].transcript?.trim();
        if (!t || t.split(' ').length < 2) continue;
        finish(t);
        return;
      }
    };

    recognition.onerror = (e) => {
      console.warn(`[MuteButton][WebSpeech] Error: ${e.error} (attempt ${retryCount + 1})`);
      if (done) return;
      done = true;
      try { recognition.abort(); } catch(_) {}
      webSpeechRecognitionRef.current = null;
      setIsListening(false);

      // Recoverable errors: retry up to 3 times, then stop.
      // 'network'       — transient Google STT failure (common in Electron)
      // 'no-speech'     — WebSpeech built-in silence timeout (~7s)
      // 'audio-capture' — mic briefly unavailable
      const retryable = ['network', 'no-speech', 'audio-capture'];
      if (retryable.includes(e.error) && handsFreeActiveRef.current && retryCount < 3) {
        console.log(`[MuteButton][WebSpeech] Retrying after '${e.error}' (${retryCount + 1}/3)...`);
        setIsMonitoring(true);
        setTimeout(() => startMuteButtonWebSpeech(retryCount + 1), 1500);
        return;
      }
      // Max retries exceeded or permanent error — stop the assistant.
      if (retryCount >= 3) {
        console.warn('[MuteButton][WebSpeech] Network error persists after 3 retries — stopping assistant.');
      }
      handsFreeActiveRef.current = false;
      setIsMonitoring(false);
    };

    recognition.onend = () => { if (!done) finish(null); };
    recognition.start();
  };

  // === MUTE-BUTTON OFFLINE: VAD — neural end detection, no amplitude polling, no feedback loop ===
  // deafMs: how long to ignore speech-end callbacks after starting.
  //   1500ms — initial button click (just analog_boot to clear)
  //   2500ms — return after AI response (TTS echo + analog_boot + redemptionFrames all need to clear)
  //    300ms — timeout restart (nothing is playing, just a brief reset)
  const startMuteButtonVAD = async (deafMs = 1500) => {
    // Kill any stale amplitude monitor or WebSpeech instance from a previous cycle
    // before VAD takes over — prevents phantom 'stop' beeps from lingering listeners.
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    if (webSpeechRecognitionRef.current) {
      try { webSpeechRecognitionRef.current.abort(); } catch (e) {}
      webSpeechRecognitionRef.current = null;
    }
    try {
      const vad = await initOfflineVAD(); // reuses existing instance if already warm
      vadPhaseRef.current = 'question';   // skip wake word, go straight to capture

      const capTimer = setTimeout(() => {
        if (!handsFreeActiveRef.current) return; // user explicitly stopped — don't restart
        vadQuestionHandlerRef.current = null;
        vad.pause();
        setIsListening(false);
        // Stay in monitoring — restart the cycle so the assistant keeps waiting.
        // The user never spoke; this is not a reason to turn off the assistant.
        console.log('[MuteButton][VAD] No speech in 15s — restarting monitor...');
        startMuteButtonVAD(300); // nothing playing — minimal deaf period
      }, 15000);

      vadQuestionHandlerRef.current = async (audio) => {
        clearTimeout(capTimer);
        vadQuestionHandlerRef.current = null;
        vad.pause();
        setIsListening(false);
        setIsMonitoring(false);

        if (audio.length < 4000) { console.log('[MuteButton][VAD] Audio too short — restarting monitor...'); startMuteButtonVAD(300); return; }

        playBeep('processing');
        setIsTranscribing(true);
        pipelineStartRef.current = performance.now();
        startThinkingVideo();
        const wavBytes = float32ToWav(audio);
        const lang = JSON.parse(localStorage.getItem('voice_settings') || '{}').sttLanguage || 'en';

        try {
          let result;
          if (activeModuleRef.current === 'gemini') {
            const gResult = await transcribeWithGoogleSTT(wavBytes);
            result = gResult !== null ? gResult : await window.electronAPI.transcribeAudio(Array.from(wavBytes), lang);
          } else {
            result = await window.electronAPI.transcribeAudio(Array.from(wavBytes), lang);
          }
          const t = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
          console.log(`[⏱️ TIMER] Mute-button transcription done in ${t}s`);
          setIsTranscribing(false);
          if (!handsFreeActiveRef.current) return;

          if (result.success && result.text?.trim()) {
            const q = result.text.trim();
            if (/[♪♬]/.test(q) || (q.startsWith('(') && q.endsWith(')')) || (q.startsWith('[') && q.endsWith(']'))) {
              console.log(`[MuteButton][VAD] ❌ Filtered hallucination: "${q}" — restarting monitor...`);
              startMuteButtonVAD(300);
              return;
            }
            if (isRepeatRequest(q) && lastAnswerRef.current) {
              playBeep('tickle');
              handleDesktopActions(lastAnswerRef.current, 'voice');
              return;
            }
            console.log(`[MuteButton][VAD] ✅ Question: "${q}"`);
            handleInteractionRequestRef.current({ requestId: `mb-${Date.now()}`, question: q, inputType: 'voice' });
          } else {
            console.log('[MuteButton][VAD] Empty transcription — restarting monitor...');
            startMuteButtonVAD(300);
          }
        } catch (err) {
          setIsTranscribing(false);
          console.log('[MuteButton][VAD] Transcription error — restarting monitor...');
          startMuteButtonVAD(300);
        }
      };

      // Stamp deaf period: any speech-end that fires before this timestamp is discarded in onSpeechEnd.
      // VAD starts immediately so no buffered audio is missed, but boot sound captures are thrown away.
      vadDeafUntilRef.current = performance.now() + deafMs;
      console.log(`[VAD] Deaf period: ${deafMs}ms`);
      vad.start();
    } catch (err) {
      console.error('[MuteButton][VAD] Init failed — falling back to amplitude:', err);
      startMuteButtonAmplitude();
    }
  };

  // P5: Push-to-talk — hold Ctrl+Space to record, release to send
  useEffect(() => {
    const startPTT = async (e) => {
      if (!(e.ctrlKey && e.code === 'Space')) return;
      if (pttMediaRecorderRef.current) return; // already recording
      e.preventDefault();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        pttChunksRef.current = [];
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mr.ondataavailable = (ev) => { if (ev.data.size > 0) pttChunksRef.current.push(ev.data); };
        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          pttMediaRecorderRef.current = null;
          setIsPTTRecording(false);
          const blob = new Blob(pttChunksRef.current, { type: 'audio/webm' });
          pttChunksRef.current = [];
          if (blob.size < 1000) return;
          playBeep('process_p1');
          const txResult = await transcribeBlob(blob);
          if (txResult.success && txResult.text?.trim()) {
            const q = txResult.text.trim();
            console.log(`[PTT] Question: "${q}"`);
            startThinkingVideo();
            handleInteractionRequestRef.current({ question: q, inputType: 'voice', requestId: `ptt-${Date.now()}` });
          }
        };
        pttMediaRecorderRef.current = mr;
        mr.start(250);
        setIsPTTRecording(true);
        playBeep('start');
        console.log('[PTT] Recording started (Ctrl+Space)');
      } catch (err) {
        console.error('[PTT] Mic error:', err);
      }
    };

    const stopPTT = (e) => {
      if (e.code !== 'Space') return;
      if (pttMediaRecorderRef.current?.state === 'recording') {
        pttMediaRecorderRef.current.stop();
        playBeep('stop');
        console.log('[PTT] Recording stopped');
      }
    };

    window.addEventListener('keydown', startPTT);
    window.addEventListener('keyup', stopPTT);
    return () => {
      window.removeEventListener('keydown', startPTT);
      window.removeEventListener('keyup', stopPTT);
    };
  }, []);

  // Pre-warm speech synthesis engine — eliminates 300-500ms cold-start on first response
  useEffect(() => {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }, []);

  // Release the full-duplex TTS engine (AudioContext + IPC listeners) on unmount.
  useEffect(() => {
    return () => {
      localTtsRef.current?.dispose().catch(() => {});
      localTtsRef.current = null;
    };
  }, []);

  // Re-route wake word when user switches module while hands-free is already running
  useEffect(() => {
    // If a Gemini Live call is running, switching away from online mode ends it cleanly
    // (the offline listener must not start on top of a Live teardown).
    if (liveActiveRef.current) {
      stopGeminiLive();
      return;
    }
    if (!handsFreeActiveRef.current) return;
    if (webSpeechRecognitionRef.current) {
      try { webSpeechRecognitionRef.current.stop(); } catch (e) {}
      webSpeechRecognitionRef.current = null;
    }
    if (offlineVADRef.current) {
      try { offlineVADRef.current.destroy(); } catch (e) {}
      offlineVADRef.current = null;
    }
    vadPhaseRef.current = 'wake';
    vadQuestionHandlerRef.current = null;
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    startHandsFreeListening();
  }, [activeModule]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onExternalAIResponse) {
        console.log('[Dashboard] ✅ Attached External AI Response Listener (Ollama Bridge)');
        
        const removeResponseListener = window.electronAPI.onExternalAIResponse((data) => {
            console.log('[Dashboard] 🖥️ Bridge Response detected:', data.question.substring(0, 20));
            handleDesktopActions(data.answer, 'voice');
        });

        const removeThinkingListener = window.electronAPI.onExternalAIThinking && 
            window.electronAPI.onExternalAIThinking(() => {
                console.log('[Dashboard] 🖥️ Bridge Thinking detected');
                setIsAIBusy(true);
                startThinkingVideo();
            });

        return () => {
            removeResponseListener();
            if (removeThinkingListener) removeThinkingListener();
        };
    }
  }, []);

  const handleInteractionRequest = async (data) => {
    const { question, providedAnswer, answer, triggerVideo, inputType, requestId } = data;
    const finalProvidedAnswer = providedAnswer || answer;

    try {
        // Environmental Noise Filter: 
        // 1. Ignore if already busy
        if (isAIBusy && inputType === 'voice') {
            console.log('[Dashboard] AI is Busy - Ignoring Voice Input');
            return;
        }

        if (inputType === 'voice') {
            const trimmedQuestion = (question || '').trim();
            if (!trimmedQuestion) {
                 setIsAIBusy(false);
                 return;
            }
        }

        // Set busy state to prevent multi-triggers while LLM is thinking
        const aiStartTime = performance.now();
        console.log(`[⏱️ TIMER] AI generation started...`);
        setIsAIBusy(true);

        // Play "Thinking" video on hologram while AI generates response (In case it wasn't triggered by Voice)
        startThinkingVideo();

        let currentModule = activeModule;
        
        // --- 1. Check Predefined DB or Manual Provided Answer ---
        // ONLY if the active module is actually 'predefined'. If it's an AI module, let the AI generate the answer!
        if (activeModule === 'predefined') {
            const predefinedDataStr = localStorage.getItem('predefined_qa');
            if (predefinedDataStr) {
                try {
                    const QA = JSON.parse(predefinedDataStr);
                    const qLower = (question || "").toLowerCase();
                    const match = QA.find(qa => qa.question.toLowerCase() === qLower);
                    
                    if (match && match.ai) {
                        // It specifically demands an AI model (e.g. gemma instead of predefined)
                        console.log(`[Dashboard] Predefined answer requires AI: ${match.ai}`);
                        const loadResult = await loadModule(match.ai);
                        if (loadResult.success) {
                            currentModule = match.ai;
                        }
                    } else if (match && !match.ai) {
                        if (match.answer && match.answer.trim() !== '') {
                            // We found an exact Predefined match WITH a manual answer -> Speak immediately!
                            console.log('[Dashboard] Found exact Predefined match with manual answer');
                            await handleDesktopActions(match.answer, inputType || 'text');
                            return; // Done
                        } else {
                            // The user added a Predefined Question but hid the answer (AI Brain Mode!)
                            // We need to fetch an answer from the AI!
                            console.log('[Dashboard] Found exact Predefined match but answer is empty (AI Brain) - Routing to AI');
                            const models = user?.models || [];
                            const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : (models.includes('openai') ? 'openai' : null));
                            if (targetModel) {
                                const loadResult = await loadModule(targetModel);
                                if (loadResult.success) currentModule = targetModel;
                            } else {
                                 console.warn('[Dashboard] Empty predefined answer but no AI brain available to answer it.');
                                 setIsAIBusy(false);
                                 return;
                            }
                        }
                    } else if (!match) {
                         // No match in predefined DB.
                         // Did Mobile Sync provide an answer over the wire instead?
                         if (finalProvidedAnswer) {
                            console.log('[Dashboard] No predefined match, but using Mobile Sync Provided Answer');
                            await handleDesktopActions(finalProvidedAnswer, inputType || 'text');
                            return;
                         }

                         // See if user has AI models to fallback to
                         const models = user?.models || [];
                         const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : (models.includes('openai') ? 'openai' : null));
                         
                         if (targetModel) {
                             console.log(`[Dashboard] No predefined match, falling back to AI: ${targetModel}`);
                             // Try to load the module
                             const loadResult = await loadModule(targetModel);
                           
                              if (loadResult.success) {
                                  currentModule = targetModel;
                              } else {
                                  console.error(`[Dashboard] Failed to load ${targetModel}:`, loadResult.error);
                               
                                  if (loadResult.code === 'REQUIRES_SETUP' || loadResult.suggestWizard) {
                                     const confirmSetup = window.confirm(
                                       'AI Brain needs setup to respond.\n\n' +
                                       'Option A — Install Ollama: Go to "AI Modules" tab and click "Setup AI Core" for an automated install.\n\n' +
                                       'Option B — LM Studio: Open LM Studio → Local Server tab → load a model → Start Server.\n\n' +
                                       'Go to AI Modules now?'
                                     );
                                     if (confirmSetup) {
                                        setActiveTab('modules');
                                     }
                                  } else {
                                     alert(`AI Error: ${loadResult.error || 'Failed to initialize AI Brain'}`);
                                  }
                                  return; // Abort interaction if AI failed
                              }
                          } else {
                              console.log('[Dashboard] Predefined mode active but no manual answer or QA provided - skipping processing');
                              setIsAIBusy(false);
                              return;
                          }
                     }
                } catch (e) {
                    console.error('Error parsing predefined QA', e);
                }
            } else if (finalProvidedAnswer) {
                 // We don't have a Predefined DB, but we got a manual answer from Mobile Sync
                 console.log('[Dashboard] Using Mobile Sync Provided Answer');
                 await handleDesktopActions(finalProvidedAnswer, inputType || 'text');
                 return;
            } else {
                // We have no DB, no manual answer. Ensure an AI module is loaded.
                const models = user?.models || [];
                const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : (models.includes('openai') ? 'openai' : null));
                if (targetModel) {
                    const loadResult = await loadModule(targetModel);
                    if (loadResult.success) currentModule = targetModel;
                } else {
                    console.log('[Dashboard] Predefined mode active but no manual answer or QA provided - skipping processing');
                    setIsAIBusy(false);
                    return;
                }
            }
        }

        // --- 2. Generate response using the active AI Module ---

        // P1: Build a streaming TTS callback for voice input.
        // Two engines can stream here:
        //   - full-duplex ON  : Piper raw PCM through WebAudio (interruptible)
        //   - full-duplex OFF : Web Speech API, and Piper voices fall through to
        //                       handleDesktopActions which speaks the full string at the end
        const voiceSettingsSnap = JSON.parse(localStorage.getItem('voice_settings') || '{}');
        const ttsMode = voiceSettingsSnap.interactionMode || 'adaptive';
        const fullDuplex = isFullDuplexEnabled();
        const isPiperVoice = voiceSettingsSnap.voice?.includes('lessac')
            || voiceSettingsSnap.voice?.includes('kusal')
            || voiceSettingsSnap.voice?.startsWith('Piper');
        const wantsSpeech = (ttsMode === 'always_speak') || (ttsMode === 'adaptive' && inputType === 'voice');
        // Full duplex streams every voice through Piper, so the Piper exclusion no longer applies.
        const shouldStreamSpeak = wantsSpeech && (fullDuplex || !isPiperVoice);

        let streamSentencesEmitted = 0;
        let streamSentencesEnded = 0;
        let streamingComplete = false;
        let streamVideoStarted = false;
        let streamFinished = false;
        let streamWatchdog = null;
        bargeInTurnRef.current = false; // fresh turn — no interruption claimed yet

        // Cleanup must be idempotent: onend, onerror and the watchdog can each reach here,
        // but the mic may only be reopened once.
        const onStreamFinished = () => {
            if (streamFinished) return;
            streamFinished = true;
            if (streamWatchdog) { clearTimeout(streamWatchdog); streamWatchdog = null; }
            if (pipelineStartRef.current) {
                const totalTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
                console.log(`[⏱️ TIMER] TTS finished speaking`);
                console.log(`[⏱️ TIMER] ═══ TOTAL PIPELINE: ${totalTime}s ═══`);
                pipelineStartRef.current = null;
            }
            window.electronAPI?.stopHologramVideo();
            resetBusyState('tts_finished');
            autoRestartListening();
        };

        // An utterance is "settled" whether it ended cleanly or errored. Counting only onend
        // leaves emitted > ended forever, so cleanup never runs and the kiosk stays busy.
        const settleUtterance = () => {
            streamSentencesEnded++;
            if (streamingComplete && streamSentencesEnded === streamSentencesEmitted) {
                onStreamFinished();
            }
        };

        // Last-resort net: SAPI can drop both onend and onerror. Without this the mic
        // never reopens and the kiosk needs a restart.
        streamWatchdog = setTimeout(() => {
            console.warn('[Dashboard] Streaming TTS watchdog fired — forcing cleanup');
            if (fullDuplex) {
                bargeInArmedRef.current = false;
                localTtsRef.current?.cancel();
            } else {
                try { window.speechSynthesis.cancel(); } catch (e) { /* already torn down */ }
            }
            onStreamFinished();
        }, 45000);

        const startStreamVideo = () => {
            if (streamVideoStarted) return;
            streamVideoStarted = true;
            const storedVids = JSON.parse(localStorage.getItem('videos') || '[]');
            const primaryId = localStorage.getItem('primary_video');
            const primaryVid = storedVids.find(v => v.id == primaryId);
            if (primaryVid && window.electronAPI?.playHologramVideo) {
                console.log('[Dashboard] 🎬 Switching to PRIMARY video (streaming TTS started)');
                window.electronAPI.playHologramVideo(primaryVid);
            }
        };

        // Full-duplex: one long-lived engine, retargeted at each response. Playback goes
        // through WebAudio so the mic can stay open and the user can interrupt.
        if (fullDuplex && shouldStreamSpeak) {
            if (!localTtsRef.current) {
                localTtsRef.current = new LocalTtsEngine({ voice: getFullDuplexVoice() });
            }
            const engine = localTtsRef.current;
            engine.reset();
            engine.voice = getFullDuplexVoice();
            engine.setVolume(voiceSettingsSnap.volume ?? 1.0);
            engine.onStart = () => {
                startStreamVideo();
                bargeInArmedRef.current = true; // from here on, user speech interrupts
                // Reopen the mic *while speaking* — the whole point of full duplex. Echo
                // cancellation keeps our own output out of the capture, so no deaf window.
                if (offlineVADRef.current && handsFreeActiveRef.current) {
                    vadPhaseRef.current = 'speaking';
                    try { offlineVADRef.current.start(); } catch (e) { /* already running */ }
                }
                console.log('[LocalTTS] speaking — mic open, barge-in armed');
            };
            engine.onDrained = () => {
                bargeInArmedRef.current = false;
                // Finished uninterrupted: leave 'speaking' so the normal restart path
                // (autoRestartListening) decides what listens next.
                if (vadPhaseRef.current === 'speaking') {
                    try { offlineVADRef.current?.pause(); } catch (e) { /* already paused */ }
                    vadPhaseRef.current = 'wake';
                }
                onStreamFinished();
            };
            engine.onError = (e) => console.error('[LocalTTS] error:', e);
        }

        const streamingTTSChunk = shouldStreamSpeak ? (sentence) => {
            const cleaned = cleanTextForTTS(sentence);
            if (!cleaned) return;

            if (fullDuplex) {
                localTtsRef.current?.speak(cleaned);
                return;
            }

            startStreamVideo();
            streamSentencesEmitted++;
            const utter = new SpeechSynthesisUtterance(cleaned);
            const allVoices = window.speechSynthesis.getVoices();
            console.log(`[TTS] Speaking: "${cleaned.slice(0, 60)}" | voices available: ${allVoices.length} | setting: "${voiceSettingsSnap.voice || 'none'}"`);
            if (voiceSettingsSnap.voice) {
                const v = allVoices.find(v => v.name === voiceSettingsSnap.voice);
                if (v) { utter.voice = v; console.log(`[TTS] Using voice: ${v.name}`); }
                else console.warn(`[TTS] Voice "${voiceSettingsSnap.voice}" not found — using system default`);
            }
            utter.pitch = voiceSettingsSnap.pitch || 1.1;
            utter.rate = voiceSettingsSnap.rate || 1.0;
            utter.volume = voiceSettingsSnap.volume || 1.0;
            console.log(`[TTS] pitch=${utter.pitch} rate=${utter.rate} vol=${utter.volume} speaking=${window.speechSynthesis.speaking} pending=${window.speechSynthesis.pending}`);
            utter.onstart = () => console.log('[TTS] ✅ onstart fired — audio should be playing');
            // Chromium fires onerror (never onend) when speechSynthesis.cancel() interrupts a
            // queued utterance — so this path must settle the counter exactly like onend does.
            utter.onerror = (e) => {
                console.error('[TTS] ❌ onerror:', e.error);
                settleUtterance();
            };
            utter.onend = () => {
                console.log('[TTS] onend fired');
                settleUtterance();
            };
            window.speechSynthesis.speak(utter);
            console.log(`[TTS] After speak(): speaking=${window.speechSynthesis.speaking} pending=${window.speechSynthesis.pending}`);
        } : null;

        let result = await processQuestion(question, streamingTTSChunk).catch(err => {
            console.error('[Dashboard] Question processing failed:', err);
            return { success: false, error: err.message };
        });

        // Gemini quota/rate-limit fallback — silently retry with Offline AI Brain
        if (!result.success && activeModuleRef.current === 'gemini' &&
            result.error && /quota|429|rate.?limit/i.test(result.error)) {
            console.warn('[Dashboard] Gemini quota hit — falling back to Offline AI Brain...');
            const gemmaInst = getModuleInstance('gemma');
            if (gemmaInst?.isAvailable()) {
                result = await gemmaInst.processQuestion(question, streamingTTSChunk)
                    .catch(() => ({ success: false }));
            }
        }

        const finalAnswer = result.success ? result.answer : "I couldn't process that request.";
        if (result.success) lastAnswerRef.current = finalAnswer;
        const aiTime = ((performance.now() - aiStartTime) / 1000).toFixed(2);
        console.log(`[⏱️ TIMER] AI response received in ${aiTime}s`);

        // Record the answered question for per-tenant usage patterns. Fire-and-forget —
        // analytics must never delay speaking or break the turn.
        if (result.success) {
          window.electronAPI?.recordInteraction?.({
            question,
            answer: finalAnswer,
            module: activeModuleRef.current,
            inputType: inputType || 'text',
            latencyMs: Math.round(performance.now() - aiStartTime),
          })?.catch?.(() => {});
        }

        if (shouldStreamSpeak && fullDuplex) {
            // Normally cleanup fires from the engine's drain callback once the tail finishes.
            // But if barge-in fired, it already reset state and started the next listener —
            // running onStreamFinished here too would call autoRestartListening() on top of
            // that, producing two capture timers and killing the new turn's video.
            if (bargeInTurnRef.current) {
                if (streamWatchdog) { clearTimeout(streamWatchdog); streamWatchdog = null; }
                console.log('[Dashboard] Turn was interrupted — barge-in owns cleanup');
            } else {
                const engine = localTtsRef.current;
                if (!engine || engine.cancelled) onStreamFinished();
                else engine.endOfStream();
            }
        } else if (shouldStreamSpeak) {
            // Mark stream done; cleanup fires from last utterance's onend
            streamingComplete = true;
            console.log(`[⏱️ TIMER] Streaming TTS — ${streamSentencesEmitted} sentences queued`);
            if (streamSentencesEmitted === 0) {
                // Nothing was spoken (empty response) — clean up immediately
                onStreamFinished();
            } else if (streamSentencesEnded === streamSentencesEmitted) {
                // All utterances already finished before we got here
                onStreamFinished();
            }
            // Otherwise onend of last utterance fires onStreamFinished()
        } else {
            console.log(`[⏱️ TIMER] Starting TTS...`);
            await handleDesktopActions(finalAnswer, inputType || 'text');
        }

        if (window.electronAPI?.sendAIResponse && requestId) {
            window.electronAPI.sendAIResponse({ requestId, answer: finalAnswer, shouldSpeak: true });
        }
    } catch (err) {
        console.error('Request Error:', err);
        resetBusyState('request_error'); // Reset on error
    }
  };
  // Keep refs pointed at the latest closure/value every render
  handleInteractionRequestRef.current = handleInteractionRequest;
  activeModuleRef.current = activeModule;

  // === ONLINE REAL-TIME MODE: Gemini Live API ===
  // For the 'gemini' module we skip the whole VAD → Whisper → LLM → speechSynthesis
  // chain and open one bidirectional Live session: Gemini listens continuously,
  // understands free-form speech, replies in its own voice, and handles barge-in
  // (user talks over it → it stops and listens again) — like a phone call.
  const switchToPrimaryVideo = () => {
    const storedVids = JSON.parse(localStorage.getItem('videos') || '[]');
    const primaryId = localStorage.getItem('primary_video');
    const primaryVid = storedVids.find(v => v.id == primaryId);
    if (primaryVid && window.electronAPI?.playHologramVideo) {
      window.electronAPI.playHologramVideo(primaryVid);
    }
  };

  // Tools Gemini Live may invoke by voice to actually operate the kiosk.
  const LIVE_TOOLS = [
    {
      name: 'play_hologram_video',
      description: 'Play a specific hologram/content video on the kiosk display by its name. Use when the user asks to show, play, or watch a particular video (e.g. an intro, a product demo, pricing).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name or keywords identifying the video to play, e.g. "intro", "pricing", "demo".' },
        },
        required: ['name'],
      },
    },
    {
      name: 'stop_hologram_video',
      description: 'Stop any content video currently playing on the display and return to the idle assistant.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'end_conversation',
      description: 'End the voice conversation and put the assistant to sleep. Use only when the user clearly says goodbye or that they are finished.',
      parameters: { type: 'object', properties: {} },
    },
  ];

  const playVideoByName = (query) => {
    const videos = JSON.parse(localStorage.getItem('videos') || '[]');
    const names = videos.map(v => v.name).filter(Boolean);
    if (!query) return { success: false, error: 'No video name provided', available: names };
    const q = query.toLowerCase().trim();
    const strip = (n) => (n || '').toLowerCase().replace(/\.[^.]+$/, ''); // drop extension
    const match =
      videos.find(v => strip(v.name).includes(q)) ||
      videos.find(v => q.includes(strip(v.name)) && strip(v.name).length > 2);
    if (match && window.electronAPI?.playHologramVideo) {
      liveToolVideoRef.current = true; // user is watching this — don't override with the avatar
      window.electronAPI.playHologramVideo(match);
      return { success: true, played: match.name };
    }
    return { success: false, error: 'No matching video found', available: names };
  };

  // Execute live API function calls and report results back so it can finish speaking.
  const handleLiveToolCall = async (functionCalls) => {
    const responses = [];
    for (const call of functionCalls) {
      const { id, name, args } = call;
      let result;
      try {
        if (name === 'play_hologram_video') {
          result = playVideoByName(args?.name);
        } else if (name === 'stop_hologram_video') {
          liveToolVideoRef.current = false;
          window.electronAPI?.stopHologramVideo?.();
          result = { success: true };
        } else if (name === 'end_conversation') {
          result = { success: true };
          setTimeout(() => {
            if (activeModuleRef.current === 'openai') stopOpenAIRealtime();
            else stopGeminiLive();
          }, 2500); // let it say goodbye first
        } else {
          result = { success: false, error: `Unknown tool: ${name}` };
        }
      } catch (e) {
        result = { success: false, error: e.message };
      }
      responses.push({ id, name, response: { result } });
    }
    if (geminiLiveRef.current) geminiLiveRef.current.sendToolResponse(responses);
    if (openAIRealtimeRef.current) openAIRealtimeRef.current.sendToolResponse(responses);
  };

  const startGeminiLive = async () => {
    if (liveActiveRef.current) return;

    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert('Please enter your Gemini API Key in Cloud AI Settings first.');
      return;
    }
    if (!navigator.onLine) {
      alert('Internet connection required for Online (Live) mode.');
      return;
    }

    // Build the system instruction from the same sources the REST path used:
    // persona/instructions + any loaded Foundation Knowledge on the gemini module.
    const persona = localStorage.getItem('ai_system_instructions')
      || 'You are a helpful, professional AI assistant. Keep responses concise and conversational.';
    const geminiInst = getModuleInstance('gemini');
    let systemInstruction = persona;
    if (geminiInst && geminiInst.systemContext) {
      systemInstruction += `\n\nFoundation Knowledge:\n${geminiInst.systemContext}\n\nStrictly answer based on this knowledge if relevant.`;
    }
    // Google Search grounding: ON by default so the assistant can answer with current,
    // real-time web info. It adds a small web round-trip (slightly slower first word);
    // toggle off via localStorage.gemini_live_search='false' if instantaneous speech matters more.
    const searchEnabled = localStorage.getItem('gemini_live_search') !== 'false';

    // Tell the model what it can DO (function calling) beyond talking.
    // Ordering matters: the model's PRIMARY job is to answer the user's question. Video control is
    // a secondary tool used ONLY when the user explicitly asks for a video — never as a fallback
    // for questions it can't answer directly. Leading with video biased it into replying
    // "is there a video I can play?" to normal questions, so answering comes first here.
    const availableVideos = JSON.parse(localStorage.getItem('videos') || '[]').map(v => v.name).filter(Boolean);
    systemInstruction += `\n\nYOUR ROLE: You are a spoken-conversation assistant. Your main job is to directly answer the user's questions in a short, natural, helpful way.`;
    if (searchEnabled) {
      systemInstruction += ` For anything current or real-time — gold/silver rates, prices, news, weather, sports scores, live events — you HAVE web search: use it to look up the answer and state it. Do NOT say you "cannot access real-time information"; you can, so search and answer.`;
    }
    systemInstruction += `\n\nTOOLS (use only when relevant, never as a way to dodge a question): play a video with play_hologram_video ONLY when the user explicitly asks to see/show/watch/play a video${availableVideos.length ? ` (available videos: ${availableVideos.join(', ')})` : ''}; stop it with stop_hologram_video; end the session with end_conversation when the user says goodbye. Never offer or suggest playing a video in response to a normal question — just answer the question.`;
    // Semantic safety net for the acoustic VAD: don't answer a half-heard request.
    systemInstruction += `\n\nTURN-TAKING: If the user's request sounds cut off, unclear, or incomplete, ask one short clarifying question instead of guessing. Keep replies brief and to the point.`;

    // Turn-taking / barge-in tuning (kiosk-friendly defaults; each overridable via localStorage).
    const vadNum = (key, def) => { const n = parseInt(localStorage.getItem(key), 10); return Number.isFinite(n) ? n : def; };
    const vadConfig = {
      silenceDurationMs: vadNum('gemini_live_silence_ms', 600),     // pause length that ends a turn
      prefixPaddingMs: vadNum('gemini_live_prefix_ms', 300),        // ignore coughs/clicks
      startOfSpeechSensitivity: localStorage.getItem('gemini_live_start_sens') || 'START_SENSITIVITY_HIGH', // barge-in eagerness
      endOfSpeechSensitivity: localStorage.getItem('gemini_live_end_sens') || 'END_SENSITIVITY_HIGH',       // commit decisiveness
    };

    const pinnedModel = localStorage.getItem('gemini_live_model');
    const session = new GeminiLiveSession({
      apiKey,
      model: pinnedModel || DEFAULT_LIVE_MODEL,
      autoResolveModel: !pinnedModel, // auto-pick a valid Live model unless the user pinned one
      voice: localStorage.getItem('gemini_live_voice') || DEFAULT_LIVE_VOICE,
      vadConfig,
      // Speed: skip "thinking" latency by default (set gemini_live_no_thinking='false' to keep it).
      disableThinking: localStorage.getItem('gemini_live_no_thinking') !== 'false',
      systemInstruction,
      audioConstraints: AUDIO_CONSTRAINTS,
      // #1 Function calling — Gemini can operate the kiosk by voice.
      functionDeclarations: LIVE_TOOLS,
      // #2 Google Search grounding — ON by default for live web answers (adds a web round-trip).
      enableSearch: searchEnabled,
      // #4/#5 Proactive audio + affective dialog: the Developer API (AIza key) rejects these
      // raw setup fields, so they are OFF unless explicitly opted in via localStorage. They
      // need the official @google/genai SDK (or a Vertex key) to enable — tracked as follow-up.
      enableProactiveAudio: localStorage.getItem('gemini_live_proactive') === 'true',
      enableAffectiveDialog: localStorage.getItem('gemini_live_affective') === 'true',
      // Cost guards. A Live session bills for streamed audio the entire time it is open, so a
      // kiosk left connected after the visitor walks away is billed for an empty room — the
      // dominant source of unexpected spend at an event. Set either to 0 to disable.
      idleTimeoutMs: Number(localStorage.getItem('gemini_live_idle_ms') ?? 90000),
      maxSessionMs: Number(localStorage.getItem('gemini_live_max_ms') ?? 900000),
      callbacks: {
        onOpen: () => console.log('[Dashboard][Live] session open'),
        // The session asked to be closed (idle / ceiling). Teardown goes through the normal
        // path so UI state, refs and the mic all end up consistent.
        onAutoClose: (reason) => {
          console.warn(`[Dashboard][Live] auto-closing session (${reason})`);
          stopGeminiLive();
        },
        // Billing snapshot at session end — minutes and tokens, attributed per tenant
        // in the main process. Fire-and-forget: metering must never block teardown.
        onUsageReport: (report) => {
          window.electronAPI?.recordUsage?.(report)?.catch?.(() => {});
        },
        onListening: () => {
          setIsAIBusy(false);
          setIsMonitoring(false);
          setIsListening(true);
          // Leave a user-requested content video playing; only clear the avatar.
          if (!liveToolVideoRef.current) window.electronAPI?.stopHologramVideo?.();
        },
        onModelAudioStart: () => {
          setIsListening(false);
          setIsAIBusy(true);
          // Don't override a video the user asked to watch with the talking avatar.
          if (!liveToolVideoRef.current) switchToPrimaryVideo();
        },
        onUserTranscript: (t) => console.log(`[Dashboard][Live] 🗣️ user: "${t}"`),
        onModelTranscript: (t) => console.log(`[Dashboard][Live] 🤖 model: "${t}"`),
        onToolCall: handleLiveToolCall,
        onInterrupted: () => {
          console.log('[Dashboard][Live] ⛔ barge-in — user interrupted');
          setIsAIBusy(false);
          setIsListening(true);
          if (!liveToolVideoRef.current) window.electronAPI?.stopHologramVideo?.();
        },
        onTurnComplete: ({ answer, question }) => {
          if (answer) lastAnswerRef.current = answer;
          if (question || answer) {
            window.electronAPI?.recordInteraction?.({
              question, answer, module: 'gemini-live', inputType: 'voice',
            })?.catch?.(() => {});
          }
          if (window.electronAPI?.sendAIResponse) {
            window.electronAPI.sendAIResponse({ requestId: `live-${Date.now()}`, answer, shouldSpeak: false });
          }
        },
        onError: (msg) => {
          console.error('[Dashboard][Live] error:', msg);
          alert(`Live mode error: ${msg}`);
          stopGeminiLive();
        },
        onClose: () => stopGeminiLive(),
      },
    });

    geminiLiveRef.current = session;
    liveActiveRef.current = true;
    handsFreeActiveRef.current = true;
    setIsMonitoring(true);
    playBeep('start');

    const ok = await session.start();
    if (!ok) {
      stopGeminiLive();
    }
  };

  const stopGeminiLive = () => {
    if (geminiLiveRef.current) {
      try { geminiLiveRef.current.stop(); } catch (e) {}
      geminiLiveRef.current = null;
    }
    liveActiveRef.current = false;
    liveToolVideoRef.current = false;
    handsFreeActiveRef.current = false;
    setIsListening(false);
    setIsMonitoring(false);
    setIsAIBusy(false);
    window.electronAPI?.stopHologramVideo?.();
  };

  const startOpenAIRealtime = async () => {
    if (liveActiveRef.current) return;

    const apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
      alert('Please enter your OpenAI API Key in Cloud AI Settings first.');
      return;
    }
    if (!navigator.onLine) {
      alert('Internet connection required for Realtime mode.');
      return;
    }

    const persona = localStorage.getItem('ai_system_instructions')
      || 'You are a helpful, professional AI assistant. Keep responses concise and conversational.';
    const openAiInst = getModuleInstance('openai');
    let systemInstruction = persona;
    if (openAiInst && openAiInst.systemContext) {
      systemInstruction += `\n\nFoundation Knowledge:\n${openAiInst.systemContext}\n\nStrictly answer based on this knowledge if relevant.`;
    }

    const availableVideos = JSON.parse(localStorage.getItem('videos') || '[]').map(v => v.name).filter(Boolean);
    systemInstruction += `\n\nYOUR ROLE: You are a spoken-conversation assistant. Your main job is to directly answer the user's questions in a short, natural, helpful way.`;
    systemInstruction += `\n\nTOOLS: play a video with play_hologram_video ONLY when the user explicitly asks to see/show/watch/play a video${availableVideos.length ? ` (available videos: ${availableVideos.join(', ')})` : ''}; stop it with stop_hologram_video; end the session with end_conversation when the user says goodbye.`;

    const session = new OpenAIRealtimeSession({
      apiKey,
      model: localStorage.getItem('openai_model') || DEFAULT_OPENAI_REALTIME_MODEL,
      voice: localStorage.getItem('openai_voice') || DEFAULT_OPENAI_REALTIME_VOICE,
      systemInstruction,
      audioConstraints: AUDIO_CONSTRAINTS,
      functionDeclarations: LIVE_TOOLS,
      callbacks: {
        onOpen: () => console.log('[Dashboard][OpenAIRealtime] session open'),
        onListening: () => {
          setIsAIBusy(false);
          setIsMonitoring(false);
          setIsListening(true);
          if (!liveToolVideoRef.current) window.electronAPI?.stopHologramVideo?.();
        },
        onModelAudioStart: () => {
          setIsListening(false);
          setIsAIBusy(true);
          if (!liveToolVideoRef.current) switchToPrimaryVideo();
        },
        onUserTranscript: (t) => console.log(`[Dashboard][OpenAIRealtime] 🗣️ user: "${t}"`),
        onModelTranscript: (t) => console.log(`[Dashboard][OpenAIRealtime] 🤖 model: "${t}"`),
        onToolCall: handleLiveToolCall,
        onInterrupted: () => {
          console.log('[Dashboard][OpenAIRealtime] ⛔ barge-in — user interrupted');
          setIsAIBusy(false);
          setIsListening(true);
          if (!liveToolVideoRef.current) window.electronAPI?.stopHologramVideo?.();
        },
        onTurnComplete: ({ answer, question }) => {
          if (answer) lastAnswerRef.current = answer;
          if (question || answer) {
            window.electronAPI?.recordInteraction?.({
              question, answer, module: 'openai-realtime', inputType: 'voice',
            })?.catch?.(() => {});
          }
          if (window.electronAPI?.sendAIResponse) {
            window.electronAPI.sendAIResponse({ requestId: `live-${Date.now()}`, answer, shouldSpeak: false });
          }
        },
        onError: (msg) => {
          console.error('[Dashboard][OpenAIRealtime] error:', msg);
          alert(`OpenAI Realtime mode error: ${msg}`);
          stopOpenAIRealtime();
        },
        onClose: () => stopOpenAIRealtime(),
      },
    });

    openAIRealtimeRef.current = session;
    liveActiveRef.current = true;
    handsFreeActiveRef.current = true;
    setIsMonitoring(true);
    playBeep('start');

    const ok = await session.start();
    if (!ok) {
      stopOpenAIRealtime();
    }
  };

  const stopOpenAIRealtime = () => {
    if (openAIRealtimeRef.current) {
      try { openAIRealtimeRef.current.stop(); } catch (e) {}
      openAIRealtimeRef.current = null;
    }
    liveActiveRef.current = false;
    liveToolVideoRef.current = false;
    handsFreeActiveRef.current = false;
    setIsListening(false);
    setIsMonitoring(false);
    setIsAIBusy(false);
    window.electronAPI?.stopHologramVideo?.();
  };

  // === MUTE-BUTTON TRIGGERED VOICE ASSISTANT ===
  // Flow: Click Voice → Monitoring (green) → Unmute mic → Recording (red) → Mute mic → Transcribe (amber) → AI responds

  // Auto-restart: use correct mode
  const autoRestartListening = async () => {
    // Gemini Live is always-on full-duplex — it manages its own listening. Never start
    // the offline VAD/mic loop on top of a running Live session.
    if (liveActiveRef.current) return;

    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    
    // If the mic wasn't actively listening when this response was triggered 
    // (e.g., it came from Mobile Sync or a text input), DO NOT turn the mic on!
    if (!handsFreeActiveRef.current) {
       console.log('[Dashboard] Answer given from external trigger. Hands-free is off. Staying idle.');
       if (isMonitoring || isListening) {
          toggleVoiceAssistant();
       }
       return;
    }

    if (vs.handsFreeMode) {
      if (activeModule === 'predefined') {
        console.log('[Dashboard] Predefined answer given. Going back to Wake Word instead of Follow-Up.');
        startHandsFreeListening();
      } else {
        // Client demanded Continuous Conversation: Instead of wake word (P1), jump to Question (P2)
        // We start it in "Follow-Up" mode to enforce the 5-second silence timeout!
        console.log('[Dashboard] Entering 5-Second Follow-Up Mode...');
        startQuestionRecording(true);
      }
    } else {
      // PERSISTENT MONITORING: restart directly — never go through toggleVoiceAssistant() here
      // because the toggle reads stale React state and would accidentally STOP instead of START.
      console.log('[Dashboard] Returning to Mute-Monitoring state...');
      handsFreeActiveRef.current = true;
      setIsMonitoring(true);
      setIsListening(false);
      // Await TTS/beep completion before starting VAD.
      // With Voice Guide ON, "System ready." plays via TTS (~1s) — starting VAD during TTS
      // causes feedback: VAD picks up the voice guide, Whisper transcribes it, infinite loop.
      await playBeepAsync('analog_boot');
      if (!handsFreeActiveRef.current) return; // user pressed stop during the audio
      startMuteButtonVAD(2000); // 2s: analog_boot echo + TTS reverb + room decay need to clear
    }
  };

  // Detect "speak again" / "repeat" type phrases so follow-up can re-speak last answer
  const isRepeatRequest = (text) => {
    const t = text.toLowerCase().trim();
    return /speak again|say again|say that again|repeat|didn.t hear|what did you say|one more time|can you say|louder/.test(t);
  };

  // Strip punctuation and normalize text for matching
  const cleanForMatch = (text) => {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  };

  // Check if two words are similar (allows for Whisper mishearing, e.g. "bot" vs "bort")
  const wordSimilar = (a, b) => {
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    // Simple edit distance check — allow 1 character difference for short words
    if (Math.abs(a.length - b.length) > 1) return false;
    let diffs = 0;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length < b.length ? a : b;
    for (let i = 0; i < longer.length; i++) {
      if (shorter[i] !== longer[i]) diffs++;
    }
    return diffs <= 1;
  };

  // Fuzzy match — checks if wake word words appear in transcript (tolerant of Whisper errors)
  const fuzzyMatch = (transcript, wakeWord) => {
    const cleanTranscript = cleanForMatch(transcript);
    const cleanWake = cleanForMatch(wakeWord);
    
    // Exact substring match after cleaning
    if (cleanTranscript.includes(cleanWake)) return true;

    // Word-by-word fuzzy match
    const transcriptWords = cleanTranscript.split(' ');
    const wakeWords = cleanWake.split(' ');
    if (wakeWords.length === 0) return false;

    let matched = 0;
    for (const ww of wakeWords) {
      if (transcriptWords.some(tw => wordSimilar(tw, ww))) matched++;
    }
    return matched >= wakeWords.length; // ALL wake words must match (with fuzzy tolerance)
  };

  // === HANDS-FREE MODE — TWO-PHASE (Fully Offline) ===
  // Phase 1: Monitor audio → Speech → Record → Silence → Whisper → Check wake word
  // Phase 2: Beep → Monitor audio → Speech → Record → Silence → Whisper → Send question to AI

  // Shared: start mic monitoring, record on speech, stop on silence, call onComplete with audio blob
  // isFollowUp enforces a strict 5-second timeout where the recording fails and goes back to sleep
  const startAudioCapture = async (phase, onComplete, isFollowUp = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      handsFreeStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      handsFreeAnalyserRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceFrames = 0;
      let speechFrames = 0;
      let idleFrames = 0;
      let hasSpoken = false;
      const SILENCE_THRESHOLD = 10;
      const SPEECH_THRESHOLD = 15;
      const MIN_SPEECH_FRAMES = 5;

      // P1/P2 normal: 1 second stop
      // P2 Follow-Up: 5 seconds timeout waiting for speech vs 1 second post-speech
      const IDLE_TIMEOUT = isFollowUp ? 50 : 10; 
      const POST_SPEECH_TIMEOUT = 10;

      if (phase === 1) {
        setIsWakeWordListening(true);
        setIsListening(false);
      } else {
        setIsWakeWordListening(false);
        setIsListening(true);
      }

      const audioCaptureStartTime = performance.now();

      monitorIntervalRef.current = setInterval(() => {
        // Enforce a DEAF PERIOD so the microphone ignores the wake word beep
        if (performance.now() - audioCaptureStartTime < 1500) return;

        analyser.getByteFrequencyData(dataArray);
        const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (!isRecordingRef.current) {
          if (avgLevel > SPEECH_THRESHOLD) {
            console.log(`[HandsFree-P${phase}] 🔴 Speech detected (level: ${avgLevel.toFixed(1)}) — Recording!`);
            audioChunksRef.current = [];
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = async () => {
              if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
              monitorIntervalRef.current = null;
              handsFreeStreamRef.current?.getTracks().forEach(t => t.stop());
              handsFreeStreamRef.current = null;
              if (handsFreeAnalyserRef.current) {
                try { handsFreeAnalyserRef.current.close(); } catch(e) {}
                handsFreeAnalyserRef.current = null;
              }
              setIsListening(false);
              setIsWakeWordListening(false);
              const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              audioChunksRef.current = [];
              await onComplete(blob);
            };
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(250);
            isRecordingRef.current = true;
            speechFrames = 1;
            silenceFrames = 0;
            hasSpoken = false;
            // Phase 1: keep wake word banner (indigo) — user should NOT speak question yet
            // Phase 2: show "AI IS LISTENING" (red) — user speaks question now
            if (phase === 2) {
              setIsListening(true);
              setIsWakeWordListening(false);
            }
          } else if (isFollowUp) {
            // If they never speak, we still need to timeout after 5 seconds!
            idleFrames++;
            if (idleFrames >= IDLE_TIMEOUT) {
              console.log(`[HandsFree-P${phase}] ⏹️ 5s window expired without speech.`);
              if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
              monitorIntervalRef.current = null;
              handsFreeStreamRef.current?.getTracks().forEach(t => t.stop());
              handsFreeStreamRef.current = null;
              if (handsFreeAnalyserRef.current) {
                try { handsFreeAnalyserRef.current.close(); } catch(e) {}
                handsFreeAnalyserRef.current = null;
              }
              setIsListening(false);
              setIsWakeWordListening(false);
              // Return tiny blob so it immediately gets rejected and goes back to sleep
              onComplete(new Blob(['empty'], { type: 'audio/webm' }));
            }
          }
        } else {
          if (avgLevel > SPEECH_THRESHOLD) {
            speechFrames++;
            silenceFrames = 0;
            if (speechFrames >= MIN_SPEECH_FRAMES) hasSpoken = true;
          } else { // avgLevel <= SPEECH_THRESHOLD is treated as silence
            const currentTimeout = hasSpoken ? POST_SPEECH_TIMEOUT : IDLE_TIMEOUT;
            // Allow stopping if we've spoken OR if it's a follow-up timeout window
            if (hasSpoken || isFollowUp) {
              silenceFrames++;
              if (silenceFrames >= currentTimeout) {
                const seconds = currentTimeout / 10;
                console.log(`[HandsFree-P${phase}] ⏹️ Silence (${seconds}s) — Stopping...`);
                playBeep(phase === 1 ? 'process_p1' : 'stop');
                isRecordingRef.current = false;
                if (mediaRecorderRef.current?.state === 'recording') {
                  mediaRecorderRef.current.stop();
                }
              }
            }
          }
        }
      }, 100);
    } catch (err) {
      console.error('[HandsFree] Microphone access denied:', err);
      alert('Microphone access denied. Please allow microphone access.');
    }
  };

  // Convert VAD's Float32Array (16kHz mono) directly to 16-bit PCM WAV bytes
  const float32ToWav = (samples) => {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true);
    w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  };

  // Google Cloud STT REST API — used for Cloud AI Brain (Gemini) mode.
  // Returns { success, text } on success, { success: false, error } on failure, null if no key (falls back to Whisper).
  const transcribeWithGoogleSTT = async (wavBytes) => {
    const apiKey = localStorage.getItem('google_stt_api_key');
    if (!apiKey) return null; // no key configured — caller falls back to Whisper

    // Build base64 without String.fromCharCode.apply (stack-safe for large audio)
    let binary = '';
    for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
    const base64 = btoa(binary);

    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    const rawLang = vs.sttLanguage || 'en';
    const langMap = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', bn: 'bn-IN' };
    const languageCode = langMap[rawLang] || rawLang;

    try {
      const t0 = performance.now();
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              encoding: 'LINEAR16',
              sampleRateHertz: 16000,
              languageCode,
              model: 'latest_long',
              enableAutomaticPunctuation: true,
              useEnhanced: true,
            },
            audio: { content: base64 }
          })
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${response.status}`;
        console.error('[GoogleSTT] API error:', msg);
        return { success: false, error: msg };
      }

      const data = await response.json();
      const t = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`[⏱️ TIMER] Google STT done in ${t}s`);

      if (data.results?.length > 0) {
        const text = data.results.map(r => r.alternatives[0].transcript).join(' ').trim();
        return { success: true, text };
      }
      return { success: false, error: 'No speech detected' };
    } catch (err) {
      console.error('[GoogleSTT] Network error:', err);
      return { success: false, error: err.message };
    }
  };

  // Shared: transcribe an audio blob via Whisper
  const transcribeBlob = async (audioBlob) => {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const wavBuffer = await convertToWav(arrayBuffer);
    const currentSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    const lang = currentSettings.sttLanguage || 'en';
    const result = await window.electronAPI.transcribeAudio(
      Array.from(new Uint8Array(wavBuffer)),
      lang
    );
    return result;
  };

  // === PHASE 1 (ONLINE): Web Speech API wake word — instant, <200ms, no local compute ===
  const startWebSpeechWakeWord = (wakeWord) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('[HandsFree-P1] Web Speech API not available — falling back to Whisper');
      startWhisperWakeWord(wakeWord);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    webSpeechRecognitionRef.current = recognition;

    setIsWakeWordListening(true);
    console.log(`[HandsFree-P1][WebSpeech] 🎙️ Waiting for wake word: "${wakeWord}"...`);

    recognition.onresult = (e) => {
      if (!handsFreeActiveRef.current) return;
      if (wakeWordCooldownRef.current) return; // prevent double-trigger
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue; // only act on final results — no partial-word false triggers
        const confidence = e.results[i][0].confidence;
        if (confidence < 0.65) continue; // ignore low-confidence crowd noise
        const transcript = e.results[i][0].transcript.toLowerCase().trim();
        console.log(`[HandsFree-P1][WebSpeech] Heard (conf:${confidence.toFixed(2)}): "${transcript}"`);
        // Exact substring match — Web Speech is accurate, no fuzzy needed
        const cleanT = cleanForMatch(transcript);
        const cleanW = cleanForMatch(wakeWord);
        if (cleanT.includes(cleanW)) {
          console.log('[HandsFree-P1][WebSpeech] ✅ Wake word MATCHED!');
          wakeWordCooldownRef.current = true;
          setTimeout(() => { wakeWordCooldownRef.current = false; }, 3000);
          recognition.stop();
          webSpeechRecognitionRef.current = null;
          setIsWakeWordListening(false);
          playBeepAsync('tickle').then(() => {
            if (handsFreeActiveRef.current) startQuestionRecording();
          });
        }
      }
    };

    recognition.onerror = (e) => {
      console.warn(`[HandsFree-P1][WebSpeech] Error: ${e.error}`);
      webSpeechRecognitionRef.current = null;
      if (handsFreeActiveRef.current) startHandsFreeListening();
    };

    recognition.onend = () => {
      // Auto-restart if not cancelled (browser stops recognition after ~60s of silence)
      webSpeechRecognitionRef.current = null;
      if (handsFreeActiveRef.current) {
        console.log('[HandsFree-P1][WebSpeech] Session ended — restarting...');
        startHandsFreeListening();
      }
    };

    recognition.start();
  };

  // === SHARED VAD FACTORY ===
  // Creates one MicVAD instance with full phase-routing callbacks.
  // Both hands-free (P1 wake → P2 question cycle) and mute-button (direct P2) share this instance.
  // vadPhaseRef controls which path onSpeechEnd takes at runtime.
  const initOfflineVAD = async () => {
    if (offlineVADRef.current) return offlineVADRef.current;

    // Resolve vad/ relative to index.html (window.location), NOT to the JS bundle in assets/.
    // When Electron loads file:///...prebot/index.html, ./vad/ must be prebot/vad/, not prebot/assets/vad/.
    const vadBase = new URL('./vad/', window.location.href).href;
    console.log('[VAD] debug > initialising vad at', vadBase);

    const ortModule = await import('onnxruntime-web');
    ortModule.env.wasm.wasmPaths = vadBase;
    ortModule.env.wasm.numThreads = 1;
    const { MicVAD } = await import('@ricky0123/vad-web');

    const vad = await MicVAD.new({
      baseAssetPath: vadBase,
      onnxWASMBasePath: vadBase,
      positiveSpeechThreshold: 0.85,  // High: ignore crowd murmur, only trigger on clear presenter voice
      negativeSpeechThreshold: 0.80,  // Aggressive cutoff: room chatter won't keep recording alive
      preSpeechPadFrames: 10,
      redemptionFrames: 6,            // ~576ms — fast end-of-speech; prevents crowd noise from extending capture

      // Provide our own stream so we can apply RNNoise before VAD processes audio.
      // Falls back to raw stream if RNNoise WASM fails to load.
      getStream: async () => {
        const rawStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        try {
          // Resolve rnnoise/ relative to index.html, same pattern as vadBase above.
          const rnnoiseBase = new URL('./rnnoise/', window.location.href).href;
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          rnnoiseAudioCtxRef.current = audioCtx;
          const rnnoiseWasmBinary = await loadRnnoise({ url: rnnoiseBase + 'rnnoise.wasm', simdUrl: rnnoiseBase + 'rnnoise.wasm' });
          await audioCtx.audioWorklet.addModule(rnnoiseBase + 'workletProcessor.js');
          const source = audioCtx.createMediaStreamSource(rawStream);
          const rnnoise = new RnnoiseWorkletNode(audioCtx, { wasmBinary: rnnoiseWasmBinary, maxChannels: 1 });
          const destination = audioCtx.createMediaStreamDestination();
          source.connect(rnnoise);
          rnnoise.connect(destination);
          console.log('[VAD] ✅ RNNoise neural noise suppression active');
          return destination.stream;
        } catch (err) {
          console.warn('[VAD] RNNoise init failed, using raw stream:', err);
          return rawStream;
        }
      },

      onSpeechStart: () => {
        if (!handsFreeActiveRef.current) return;

        // Full duplex: speech detected while the assistant is talking = interruption.
        // Handled here (on speech START, not END) so playback stops the instant the user
        // opens their mouth, rather than after they finish the sentence.
        if (vadPhaseRef.current === 'speaking') {
          if (handleBargeIn()) return;
          return; // armed=false means playback already ended; ignore this trailing detection
        }

        speechStartTimestampRef.current = performance.now();
        // Always show RED "AI IS LISTENING" when speech is detected in question phase.
        // TTS is now fully awaited (playBeepAsync) before VAD starts, so there is no system
        // audio still playing when this fires — no risk of showing listening state for our own voice.
        // The deaf period still gates onSpeechEnd (capture), so a brief echo won't get transcribed.
        if (vadPhaseRef.current === 'question') {
          setIsListening(true);
          setIsMonitoring(false);
          setIsWakeWordListening(false);
          playBeep('start'); // Audible cue: beep or "I am listening" (voice guide)
        }
        console.log(`[VAD-P${vadPhaseRef.current === 'wake' ? '1' : '2'}] 🔴 Speech detected`);
      },

      onSpeechEnd: async (audio) => {
        if (!handsFreeActiveRef.current) return;

        // Still in 'speaking' at speech-end means barge-in did not claim this utterance
        // (playback had already finished). Drop it rather than letting it fall through to
        // the wake-word check, which would transcribe the tail of our own response.
        if (vadPhaseRef.current === 'speaking') {
          console.log('[VAD] Speech ended during playback with no barge-in — discarding');
          return;
        }

        // Route to question handler (hands-free P2 or mute-button)
        if (vadPhaseRef.current === 'question') {
          // Deaf period: discard audio captured right after system plays a sound.
          // VAD continues running; it will fire again when real speech arrives.
          if (performance.now() < vadDeafUntilRef.current) {
            console.log('[VAD] Deaf period — discarding system sound capture');
            return;
          }

          // Digital Blanking of System Audio Feedback
          if (systemAudioPlayRef.current) {
            const speechEndTimestamp = performance.now();
            const totalDurationMs = audio.length / 16;
            const recordingStartTime = speechEndTimestamp - totalDurationMs;
            const playStart = systemAudioPlayRef.current.start;
            const playEnd = systemAudioPlayRef.current.end || speechEndTimestamp;

            if (playEnd > recordingStartTime && playStart < speechEndTimestamp) {
              const overlapStartMs = Math.max(0, playStart - recordingStartTime);
              const overlapEndMs = Math.min(totalDurationMs, playEnd - recordingStartTime);
              const startIndex = Math.floor(overlapStartMs * 16);
              const endIndex = Math.ceil(overlapEndMs * 16);

              console.log(`[VAD] Blanking system audio feedback: ${overlapStartMs.toFixed(0)}ms to ${overlapEndMs.toFixed(0)}ms (${startIndex} to ${endIndex} samples)`);
              for (let i = startIndex; i < endIndex; i++) {
                if (i >= 0 && i < audio.length) {
                  audio[i] = 0.0;
                }
              }
            }
            systemAudioPlayRef.current = null;
          }

          if (vadQuestionHandlerRef.current) vadQuestionHandlerRef.current(audio);
          return;
        }

        // Phase 1: wake word check (reads wake word from settings at call time)
        if (audio.length < 8000) { if (handsFreeActiveRef.current) vad.start(); return; }

        vad.pause();
        const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
        const wakeWord = (vs.wakeWord || 'hello ram').toLowerCase().trim();
        const wavBytes = float32ToWav(audio);
        setIsTranscribing(true);
        const t0 = performance.now();

        try {
          const result = await window.electronAPI.transcribeAudio(Array.from(wavBytes), 'en');
          console.log(`[⏱️ TIMER] Wake word check done in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
          setIsTranscribing(false);

          if (result.success && result.text?.trim()) {
            const fullText = result.text.trim();
            if (/[♪♬]/.test(fullText) ||
                (fullText.startsWith('(') && fullText.endsWith(')')) ||
                (fullText.startsWith('[') && fullText.endsWith(']'))) {
              console.log(`[VAD-P1] ❌ Hallucination: "${fullText}"`);
              if (handsFreeActiveRef.current) vad.start();
              return;
            }
            console.log(`[VAD-P1] Heard: "${fullText}"`);
            if (fuzzyMatch(fullText, wakeWord)) {
              console.log('[VAD-P1] ✅ Wake word MATCHED!');
              setIsWakeWordListening(false);
              playBeepAsync('tickle').then(() => {
                if (handsFreeActiveRef.current) startQuestionRecording();
              });
            } else {
              console.log('[VAD-P1] ❌ Not wake word — resuming...');
              if (handsFreeActiveRef.current) vad.start();
            }
          } else {
            if (handsFreeActiveRef.current) vad.start();
          }
        } catch (err) {
          setIsTranscribing(false);
          if (handsFreeActiveRef.current) vad.start();
        }
      },

      onVADMisfire: () => console.log('[VAD] Misfire — noise spike ignored')
    });

    offlineVADRef.current = vad;
    return vad;
  };

  // === PHASE 1 (OFFLINE): Silero VAD wake word — delegates to initOfflineVAD ===
  const startWhisperWakeWord = async (wakeWord) => {
    if (offlineVADRef.current) {
      vadPhaseRef.current = 'wake';
      offlineVADRef.current.start();
      setIsWakeWordListening(true);
      return;
    }
    console.log(`[HandsFree-P1][VAD] 🎙️ Initialising VAD for wake word: "${wakeWord}"...`);
    setIsWakeWordListening(true);
    try {
      await initOfflineVAD();
      vadPhaseRef.current = 'wake';
      offlineVADRef.current.start();
    } catch (err) {
      console.error('[HandsFree-P1][VAD] Failed — falling back to amplitude:', err);
      setIsWakeWordListening(false);
      startAmplitudeWakeWord(wakeWord);
    }
  };

  // === PHASE 1 (OFFLINE FALLBACK): Amplitude-based wake word (used if VAD fails) ===
  const startAmplitudeWakeWord = (wakeWord) => {
    console.log(`[HandsFree-P1][Amp] 🎙️ Waiting for wake word: "${wakeWord}"...`);
    startAudioCapture(1, async (audioBlob) => {
      // Check cancellation flag
      if (!handsFreeActiveRef.current) {
        console.log('[HandsFree-P1] Cancelled, stopping.');
        setIsTranscribing(false);
        return;
      }

      if (audioBlob.size < 1000) {
        console.log('[HandsFree-P1] Too short, restarting...');
        if (handsFreeActiveRef.current) startHandsFreeListening();
        return;
      }

      console.log(`[HandsFree-P1] Captured: ${audioBlob.size} bytes — Checking wake word...`);
      pipelineStartRef.current = performance.now();
      setIsTranscribing(true);

      try {
        const result = await transcribeBlob(audioBlob);

        // Check cancellation AFTER transcription completes
        if (!handsFreeActiveRef.current) {
          console.log('[HandsFree-P1] Cancelled during transcription, discarding result.');
          setIsTranscribing(false);
          return;
        }

        const transcribeTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
        console.log(`[⏱️ TIMER] Wake word check done in ${transcribeTime}s`);
        setIsTranscribing(false);

        if (result.success && result.text && result.text.trim()) {
          const fullText = result.text.trim();

          // Filter Whisper hallucinations: music notes, bracketed noise labels
          if (/[♪♬]/.test(fullText) ||
              (fullText.startsWith('(') && fullText.endsWith(')')) ||
              (fullText.startsWith('[') && fullText.endsWith(']'))) {
            console.log(`[HandsFree-P1] ❌ Filtered hallucination: "${fullText}"`);
            if (handsFreeActiveRef.current) startHandsFreeListening();
            return;
          }

          console.log(`[HandsFree-P1] Heard: "${fullText}"`);

          const isMatch = fuzzyMatch(fullText, wakeWord);
          if (isMatch) {
            console.log(`[HandsFree-P1] ✅ Wake word MATCHED! Starting Phase 2 (question recording)...`);
            playBeepAsync('tickle').then(() => {
              if (handsFreeActiveRef.current) startQuestionRecording();
            });
          } else {
            console.log(`[HandsFree-P1] ❌ Not wake word — Ignoring & restarting...`);
            if (handsFreeActiveRef.current) startHandsFreeListening();
          }
        } else {
          console.log('[HandsFree-P1] Empty transcription — restarting...');
          if (handsFreeActiveRef.current) startHandsFreeListening();
        }
      } catch (err) {
        console.error('[HandsFree-P1] Error:', err);
        setIsTranscribing(false);
        if (handsFreeActiveRef.current) startHandsFreeListening();
      }
    });
  };

  // === PHASE 1 ROUTER: pick Web Speech (online/Gemini) or Whisper (offline/Gemma) ===
  const startHandsFreeListening = async () => {
    if (isAIBusy || isTranscribing) return;

    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    const wakeWord = (vs.wakeWord || 'hello ram').toLowerCase().trim();

    handsFreeActiveRef.current = true;
    await playBeepAsync('analog_boot');
    if (!handsFreeActiveRef.current) return;

    if (activeModuleRef.current === 'gemini' || activeModuleRef.current === 'openai') {
      // Online mode — use Web Speech API (instant, no local compute)
      startWebSpeechWakeWord(wakeWord);
    } else {
      // Offline mode — use Whisper (works without internet)
      startWhisperWakeWord(wakeWord);
    }
  };

  // === PHASE 2 (ONLINE): Web Speech API question — instant, <1s, no Whisper ===
  const startWebSpeechQuestion = (isFollowUp = false) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { startWhisperQuestion(isFollowUp); return; }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true; // act immediately on isFinal — don't wait for browser silence detection
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    setIsListening(true);
    setIsWakeWordListening(false);
    console.log(`[HandsFree-P2][WebSpeech] 🎤 ${isFollowUp ? 'Follow-Up' : 'Ready'} — speak your question...`);

    let answered = false;

    const finish = (question) => {
      if (answered) return;
      answered = true;
      try { recognition.abort(); } catch (e) {}
      setIsListening(false);
      if (!question || !question.trim()) {
        console.log('[HandsFree-P2][WebSpeech] No question — back to wake word.');
        if (handsFreeActiveRef.current) startHandsFreeListening();
        return;
      }
      if (isRepeatRequest(question) && lastAnswerRef.current) {
        console.log(`[HandsFree-P2][WebSpeech] 🔁 Repeat request — re-speaking last answer`);
        playBeep('tickle');
        handleDesktopActions(lastAnswerRef.current, 'voice');
        return;
      }
      console.log(`[HandsFree-P2][WebSpeech] ✅ Question: "${question}" — Sending to AI...`);
      pipelineStartRef.current = performance.now();
      startThinkingVideo();
      handleInteractionRequest({ requestId: `hf-voice-${Date.now()}`, question, inputType: 'voice' });
    };

    recognition.onresult = (e) => {
      if (!handsFreeActiveRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue; // act on final — skip interim
        const confidence = e.results[i][0].confidence;
        if (confidence < 0.5) continue; // filter background noise
        const transcript = e.results[i][0].transcript?.trim();
        if (!transcript || transcript.split(' ').length < 2) continue; // need at least 2 words
        playBeep('stop');
        finish(transcript);
        return;
      }
    };

    recognition.onerror = (e) => {
      console.warn(`[HandsFree-P2][WebSpeech] Error: ${e.error}`);
      if (!answered) { answered = true; setIsListening(false); if (handsFreeActiveRef.current) startHandsFreeListening(); }
    };

    // Timeout: follow-up 6s, normal 10s — then give up
    const timeout = setTimeout(() => finish(null), isFollowUp ? 6000 : 10000);
    recognition.onend = () => { clearTimeout(timeout); if (!answered) finish(null); };

    recognition.start();
  };

  // === PHASE 2 (OFFLINE): VAD-based question capture ===
  // Reuses the live VAD instance from Phase 1 — no reinitialisation, no amplitude polling.
  // vadPhaseRef switches to 'question' so onSpeechEnd routes here instead of wake word check.
  const startWhisperQuestion = (isFollowUp = false) => {
    const vad = offlineVADRef.current;

    if (vad) {
      console.log(`[HandsFree-P2][VAD] 🎤 ${isFollowUp ? 'Follow-Up' : 'Ready'} — speak your question...`);
      setIsListening(true);
      setIsWakeWordListening(false);
      vadPhaseRef.current = 'question';

      // Hard cap: if ambient noise prevents onSpeechEnd from ever firing, give up after timeout
      const capTimer = setTimeout(() => {
        if (!handsFreeActiveRef.current) return;
        vadQuestionHandlerRef.current = null;
        vad.pause();
        setIsListening(false);
        console.log('[HandsFree-P2][VAD] ⏹️ Timeout — no question captured. Back to wake word.');
        if (handsFreeActiveRef.current) startHandsFreeListening();
      }, isFollowUp ? 6000 : 10000);

      vadQuestionHandlerRef.current = async (audio) => {
        clearTimeout(capTimer);
        vadQuestionHandlerRef.current = null;
        vad.pause();
        setIsListening(false);

        if (audio.length < 4000) { // < 0.25s — not a real question
          console.log('[HandsFree-P2][VAD] Too short — back to wake word.');
          vadPhaseRef.current = 'wake';
          if (handsFreeActiveRef.current) startHandsFreeListening();
          return;
        }

        pipelineStartRef.current = performance.now();
        console.log('[⏱️ TIMER] Pipeline started — transcribing question...');
        startThinkingVideo();
        setIsTranscribing(true);
        const wavBytes = float32ToWav(audio);

        try {
          const currentSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
          const lang = currentSettings.sttLanguage || 'en';
          let result;
          if (activeModuleRef.current === 'gemini' || activeModuleRef.current === 'openai') {
            const gResult = await transcribeWithGoogleSTT(wavBytes);
            result = gResult !== null ? gResult : await window.electronAPI.transcribeAudio(Array.from(wavBytes), lang);
          } else {
            result = await window.electronAPI.transcribeAudio(Array.from(wavBytes), lang);
          }
          const transcribeTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
          console.log(`[⏱️ TIMER] Question transcription done in ${transcribeTime}s`);
          setIsTranscribing(false);

          if (!handsFreeActiveRef.current) return;

          if (result.success && result.text?.trim()) {
            const question = result.text.trim();

            if (/[♪♬]/.test(question) ||
                (question.startsWith('(') && question.endsWith(')')) ||
                (question.startsWith('[') && question.endsWith(']'))) {
              console.log(`[HandsFree-P2][VAD] ❌ Filtered hallucination: "${question}"`);
              vadPhaseRef.current = 'wake';
              if (handsFreeActiveRef.current) startHandsFreeListening();
              return;
            }

            if (isRepeatRequest(question) && lastAnswerRef.current) {
              console.log('[HandsFree-P2][VAD] 🔁 Repeat request — re-speaking last answer');
              playBeep('tickle');
              handleDesktopActions(lastAnswerRef.current, 'voice');
              return;
            }

            console.log(`[HandsFree-P2][VAD] ✅ Question: "${question}" — Sending to AI...`);
            handleInteractionRequest({ requestId: `hf-voice-${Date.now()}`, question, inputType: 'voice' });
          } else {
            console.log('[HandsFree-P2][VAD] Empty transcription — back to wake word.');
            vadPhaseRef.current = 'wake';
            if (handsFreeActiveRef.current) startHandsFreeListening();
          }
        } catch (err) {
          console.error('[HandsFree-P2][VAD] Transcription error:', err);
          setIsTranscribing(false);
          vadPhaseRef.current = 'wake';
          if (handsFreeActiveRef.current) startHandsFreeListening();
        }
      };

      vad.start(); // Resume the already-warm VAD for question capture
      return;
    }

    // Fallback: amplitude-based (only if VAD failed to initialise — unexpected in normal flow)
    startAudioCapture(2, async (audioBlob) => {
      if (!handsFreeActiveRef.current) { setIsTranscribing(false); return; }

      if (audioBlob.size < 1000) {
        if (isFollowUp) {
          console.log('[HandsFree-P2] Follow-Up window closed. Back to wake word.');
          if (handsFreeActiveRef.current) startHandsFreeListening();
        } else {
          if (handsFreeActiveRef.current) autoRestartListening();
        }
        return;
      }

      pipelineStartRef.current = performance.now();
      startThinkingVideo();
      setIsTranscribing(true);
      try {
        const result = await transcribeBlob(audioBlob);
        if (!handsFreeActiveRef.current) { setIsTranscribing(false); return; }
        setIsTranscribing(false);

        if (result.success && result.text?.trim()) {
          const question = result.text.trim();
          if (/[♪♬]/.test(question) ||
              (question.startsWith('(') && question.endsWith(')')) ||
              (question.startsWith('[') && question.endsWith(']'))) {
            if (handsFreeActiveRef.current) startHandsFreeListening();
            return;
          }
          if (isRepeatRequest(question) && lastAnswerRef.current) {
            playBeep('tickle');
            handleDesktopActions(lastAnswerRef.current, 'voice');
            return;
          }
          handleInteractionRequest({ requestId: `hf-voice-${Date.now()}`, question, inputType: 'voice' });
        } else {
          if (handsFreeActiveRef.current) startHandsFreeListening();
        }
      } catch (err) {
        setIsTranscribing(false);
        if (handsFreeActiveRef.current) startHandsFreeListening();
      }
    }, isFollowUp);
  };

  // === PHASE 2 ROUTER: Web Speech (online/Gemini) or Whisper (offline/Gemma) ===
  const startQuestionRecording = (isFollowUp = false) => {
    if (isFollowUp) {
      console.log(`[HandsFree-P2] 🎤 Follow-Up Window Open! (5 seconds to speak)`);
      playBeep('process_p1');
    } else {
      console.log(`[HandsFree-P2] 🎤 Ready for question — speak now...`);
    }
    if (activeModuleRef.current === 'gemini' || activeModuleRef.current === 'openai') {
      startWebSpeechQuestion(isFollowUp);
    } else {
      startWhisperQuestion(isFollowUp);
    }
  };

  // === STOP HANDS-FREE (full cleanup + cancellation) ===
  const stopHandsFree = () => {
    console.log('[HandsFree] ⏹️ CANCEL — Stopping hands-free mode.');
    handsFreeActiveRef.current = false;
    // Stop Web Speech API if it was running (online mode)
    if (webSpeechRecognitionRef.current) {
      try { webSpeechRecognitionRef.current.stop(); } catch (e) {}
      webSpeechRecognitionRef.current = null;
    }
    // Destroy Silero VAD if it was running (offline mode)
    if (offlineVADRef.current) {
      try { offlineVADRef.current.destroy(); } catch (e) {}
      offlineVADRef.current = null;
    }
    // Stop any in-flight Piper synthesis so a killed session can't keep speaking.
    bargeInArmedRef.current = false;
    localTtsRef.current?.cancel();
    vadPhaseRef.current = 'wake';
    vadQuestionHandlerRef.current = null;
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    if (handsFreeStreamRef.current) {
      handsFreeStreamRef.current.getTracks().forEach(track => track.stop());
      handsFreeStreamRef.current = null;
    }
    if (handsFreeAnalyserRef.current) {
      try { handsFreeAnalyserRef.current.close(); } catch(e) {}
      handsFreeAnalyserRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Override onstop to prevent the callback from processing
      mediaRecorderRef.current.onstop = () => {
        console.log('[HandsFree] Recorder stopped by cancel — no processing.');
      };
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;
    audioChunksRef.current = [];
    setIsListening(false);
    setIsWakeWordListening(false);
    setIsTranscribing(false);
  };

  // === MUTE-BUTTON MODE: stopMonitoring ===
  const stopMonitoring = () => {
    // Web Speech (online mute-button)
    if (webSpeechRecognitionRef.current) {
      try { webSpeechRecognitionRef.current.stop(); } catch(e) {}
      webSpeechRecognitionRef.current = null;
    }
    // VAD (offline mute-button) — pause and clear handler, keep instance warm for reuse
    if (offlineVADRef.current && vadPhaseRef.current === 'question') {
      try { offlineVADRef.current.pause(); } catch(e) {}
      vadQuestionHandlerRef.current = null;
      vadPhaseRef.current = 'wake';
    }
    // Amplitude fallback cleanup
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    if (monitorStreamRef.current) {
      monitorStreamRef.current.getTracks().forEach(track => track.stop());
      monitorStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;
    setIsMonitoring(false);
    setIsListening(false);
  };

  const transcribeAndSend = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];

    if (audioBlob.size < 1000) {
      console.log('[Dashboard] Recording too short, ignoring.');
      return;
    }

    console.log(`[Dashboard] Recording captured: ${audioBlob.size} bytes`);
    pipelineStartRef.current = performance.now();
    console.log(`[⏱️ TIMER] Pipeline started — Transcribing...`);
    setIsTranscribing(true);

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const wavBuffer = await convertToWav(arrayBuffer);
      const currentSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
      const lang = currentSettings.sttLanguage || 'en';

      console.log(`[Dashboard] Sending ${wavBuffer.byteLength} bytes for transcription (lang: ${lang})`);
      const result = await window.electronAPI.transcribeAudio(
        Array.from(new Uint8Array(wavBuffer)),
        lang
      );

      const transcribeTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
      console.log(`[⏱️ TIMER] Transcription done in ${transcribeTime}s`);
      setIsTranscribing(false);

      if (result.success && result.text && result.text.trim()) {
        console.log('[Dashboard] Transcription result:', result.text);
        const requestId = `pc-voice-${Date.now()}`;
        handleInteractionRequest({
          requestId,
          question: result.text.trim(),
          inputType: 'voice'
        });
      } else {
        console.log('[Dashboard] Empty or failed transcription:', result);
      }
    } catch (err) {
      console.error('[Dashboard] Transcription error:', err);
      setIsTranscribing(false);
    }
  };

  const toggleVoiceAssistant = async () => {
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    const isHandsFree = vs.handsFreeMode === true;

    // ONLINE mode = Real-time call (Gemini Live / OpenAI Realtime).
    if (activeModuleRef.current === 'gemini') {
      if (liveActiveRef.current) {
        playBeep('cancel');
        stopGeminiLive();
      } else {
        if (isAIBusy || isTranscribing) return;
        await startGeminiLive();
      }
      return;
    }

    if (activeModuleRef.current === 'openai') {
      if (liveActiveRef.current) {
        playBeep('cancel');
        stopOpenAIRealtime();
      } else {
        if (isAIBusy || isTranscribing) return;
        await startOpenAIRealtime();
      }
      return;
    }

    // If already active in any mode, stop everything
    if (isMonitoring || isListening || isWakeWordListening || (isTranscribing && isHandsFree)) {
      playBeep('cancel');
      handsFreeActiveRef.current = false; // END SESSION
      
      if (isHandsFree) {
        stopHandsFree();
      } else if (isRecordingRef.current && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.onstop = async () => {
          monitorStreamRef.current?.getTracks().forEach(track => track.stop());
          monitorStreamRef.current = null;
          await transcribeAndSend();
        };
        mediaRecorderRef.current.stop();
        if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
        monitorIntervalRef.current = null;
        isRecordingRef.current = false;
        setIsMonitoring(false);
        setIsListening(false);
      } else {
        stopMonitoring();
      }
      return;
    }

    // === START: Choose mode based on settings ===
    if (isAIBusy || isTranscribing) return;

    if (isHandsFree) {
      // === HANDS-FREE MODE: Offline wake word via Whisper ===
      console.log('[Dashboard] 🎙️ Starting HANDS-FREE mode (offline wake word)...');
      handsFreeActiveRef.current = true; // START SESSION
      await startHandsFreeListening();
      return;
    }

    // Always use offline VAD + Whisper for STT regardless of AI module.
    // WebSpeech API fails in Electron because Electron has no Google API key bundled
    // (Chrome browser does; Electron doesn't). The AI backend (Ollama vs Gemini) is
    // determined downstream by activeModuleRef — only STT is affected here.
    handsFreeActiveRef.current = true;
    setIsMonitoring(true);
    await playBeepAsync('analog_boot');
    if (!handsFreeActiveRef.current) return;
    startMuteButtonVAD(2000);
  };

  // Convert WebM audio blob to WAV format for whisper-cli
  const convertToWav = async (webmBuffer) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(webmBuffer);
    const channelData = audioBuffer.getChannelData(0); // Mono
    const sampleRate = 16000;

    // Create WAV file
    const wavBuffer = new ArrayBuffer(44 + channelData.length * 2);
    const view = new DataView(wavBuffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + channelData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);  // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, channelData.length * 2, true);

    // Write PCM samples
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    audioContext.close();
    return wavBuffer;
  };


  useEffect(() => {
    if (window.electronAPI) {
        const unsubStatus = window.electronAPI.onSTTStatus((status) => {
            console.log('[OfflineVoice] Status:', status);
        });

        const unsubError = window.electronAPI.onSTTError((err) => {
            console.error('[OfflineVoice] Error:', err);
            setIsTranscribing(false);
            if (err.includes('model not found')) {
                alert(`STT Model Missing: Please go to Voice Settings and ensure the model is downloaded. (Required: ggml-small.bin)`);
            }
        });

        const unsubDiag = window.electronAPI.onSTTDiag((msg) => {
            console.log(`[OfflineVoice-DIAG] ${msg}`);
        });

        return () => {
            unsubStatus();
            unsubError();
            unsubDiag();
        };
    }
  }, [activeModule, user]);

  useEffect(() => {
    if (window.electronAPI?.onMobileChatRequest) {
        const unsubChat = window.electronAPI.onMobileChatRequest(handleInteractionRequest);
        const unsubSimple = window.electronAPI?.onMobileQuestion 
            ? window.electronAPI.onMobileQuestion((data) => {
                if (data.answer || !data.requestId) {
                    handleInteractionRequest({ ...data, requestId: data.requestId || `sq-${Date.now()}` });
                }
            }) : null;

        return () => {
            if (unsubChat) unsubChat();
            if (unsubSimple) unsubSimple();
        };
    }
  }, [activeModule, user]);

  useEffect(() => {
    return () => {
        if (window.electronAPI?.stopSTT) {
            window.electronAPI.stopSTT();
        }
        // Tear down any running Gemini Live session on unmount.
        if (geminiLiveRef.current) {
            try { geminiLiveRef.current.stop(); } catch (e) {}
            geminiLiveRef.current = null;
            liveActiveRef.current = false;
        }
    };
  }, []);  useEffect(() => {
    if (mobileSyncEnabled && window.electronAPI?.setMobilePresetsEnabled) {
      window.electronAPI.setMobilePresetsEnabled(true);
    }
  }, []);

  const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
  const mobileSyncEnabled = voiceSettings.enableMobilePresets === true;
  
  const hasPredefined = (user?.models || []).includes('predefined') || user?.role === 'superadmin' || isDesktop;
  const showQATab = hasPredefined || mobileSyncEnabled;

  const isAIAuthorized = (user?.models || []).includes('gemma') || (user?.models || []).includes('gemini') || (user?.models || []).includes('openai') || user?.role === 'superadmin';
  const aiName = isAIAuthorized ? 'AI' : 'Predefined';

  // Cloud AI Brain needs no local engine — don't demand Ollama setup while it's the active brain
  const openAiKeySet = !!localStorage.getItem('openai_api_key');
  const cloudBrainReady = (activeModule === 'gemini' && geminiKeySet) || (activeModule === 'openai' && openAiKeySet);
  const needsEngineSetup = !isOllamaReady && !cloudBrainReady;
  const tabs = [
    { id: 'modules', name: 'AI Modules', icon: <FaRobot /> },
    { id: 'videos', name: 'Videos', icon: <FaVideo /> },
    { id: 'instructions', name: 'Instructions', icon: <FaPenNib />, show: isAIAuthorized && activeModule !== 'predefined' },
    { id: 'qa', name: 'Q&A', icon: <FaQuestionCircle />, show: showQATab },
    { id: 'voice', name: 'Voice', icon: <FaVolumeUp /> }
  ].filter(t => t.show !== false);

  const handleTabChange = async (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'qa' && loadModule) {
      if (!isAIAuthorized || activeModule === 'predefined') {
          console.log('🔄 [Dashboard] Switching to Q&A tab - Activating Predefined Module');
          await loadModule('predefined');
      } else {
          console.log(`[Dashboard] Switching to Q&A tab - Keeping AI Module (${activeModule}) active for Q&A`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {(isMonitoring || isListening || isTranscribing || isWakeWordListening) && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50">
            <div className={`px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse border-4 ${
              isTranscribing 
                ? 'bg-amber-500 text-white border-amber-300'
                : isListening
                ? 'bg-red-600 text-white border-red-400'
                : isWakeWordListening
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-green-600 text-white border-green-400'
            }`}>
                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                <span className="text-xl font-black tracking-tighter">
                  {isTranscribing 
                    ? 'PROCESSING YOUR VOICE...'
                    : isListening
                    ? `${aiName.toUpperCase()} IS LISTENING...`
                    : isWakeWordListening
                    ? `SAY "${(JSON.parse(localStorage.getItem('voice_settings') || '{}').wakeWord || 'HELLO PREBOT').toUpperCase()}" TO START...`
                    : 'UNMUTE YOUR MIC TO SPEAK...'}
                </span>
            </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center overflow-hidden transition-transform hover:scale-105">
                <img src="assets/icon-extracted.png" alt="Logo" className="w-10 h-10 object-contain" onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                }} />
                <div className="hidden w-full h-full items-center justify-center bg-blue-600 text-white font-bold text-xl">AI</div>
              </div>
              <div>
                <h1 className="text-xl font-black bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent leading-none">PREBOT CONTROL</h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Unified Agentic Interface</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Option 2: Live Mic Interaction */}
              {isAIAuthorized && (
                needsEngineSetup ? (
                  <button 
                    onClick={() => {
                      setActiveTab('modules');
                      localStorage.setItem('trigger_ollama_setup', 'true');
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all shadow-md active:scale-95 bg-red-500 hover:bg-red-600 text-white hover:shadow-lg animate-pulse"
                  >
                    <FaExclamationTriangle className="text-white animate-bounce" />
                    <span>AI SETUP REQUIRED</span>
                  </button>
                ) : (
                  <button 
                    onClick={toggleVoiceAssistant}
                    disabled={isTranscribing && !handsFreeActiveRef.current}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all shadow-md active:scale-95 ${
                        isTranscribing
                        ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse cursor-wait'
                        : isListening 
                        ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] animate-pulse'
                        : isWakeWordListening
                        ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] animate-pulse'
                        : isMonitoring
                        ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] animate-pulse'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'
                    }`}
                  >
                    {isTranscribing ? <FaPenNib /> : isListening ? <FaStop /> : isWakeWordListening ? <FaHandPaper /> : <FaMicrophone />}
                    <span>
                      {isTranscribing 
                        ? (handsFreeActiveRef.current ? 'CANCEL' : 'PROCESSING...') 
                        : isListening ? `STOP ${aiName.toUpperCase()}` : (isMonitoring || isWakeWordListening) ? 'CANCEL' : 'VOICE ASSISTANT'}
                    </span>
                  </button>
                )
              )}

              {/* P5: PTT indicator — shown when Ctrl+Space is held */}
              {isPTTRecording && (
                <div className="flex items-center gap-2 bg-red-100 border border-red-400 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold animate-pulse">
                  <FaMicrophone className="text-red-600" />
                  <span>PTT — Release Ctrl+Space to send</span>
                </div>
              )}

              <div className="h-8 w-px bg-gray-200"></div>

              {localIp && (
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">Mobile Sync</span>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-xl border border-gray-200 shadow-inner">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                    <span className="text-sm font-mono font-black text-slate-700 tracking-tighter">{localIp}</span>
                  </div>
                </div>
              )}

              {/* Performance Badge */}
              <button 
                onClick={() => setShowSpecsModal(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${performanceRating.bg} ${performanceRating.color.replace('text', 'border')}`}
              >
                <span className="text-sm">{performanceRating.icon}</span>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] uppercase font-black opacity-60 tracking-widest">Performance</span>
                  <span className={`text-[10px] font-black uppercase`}>{performanceRating.label}</span>
                </div>
              </button>
              
              <button 
                onClick={logout} 
                title="Log Out"
                className="ml-2 p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all shadow-sm group relative"
              >
                  <FaSignOutAlt className="text-xl group-hover:scale-110 transition-transform" />
              </button>

            </div>
          </div>
        </div>
      </header>
      <div className="bg-white border-b border-gray-200 sticky top-[81px] z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center">
            <nav className="flex space-x-12">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-5 px-2 border-b-4 font-black text-xs uppercase tracking-widest flex items-center transition-all ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <span className="mr-3 text-lg opacity-80">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>

            {/* Relocated Support Badge */}
            <div className="relative">
              <button 
                onMouseEnter={() => setShowSupportTooltip(true)}
                onMouseLeave={() => setShowSupportTooltip(false)}
                onClick={() => setShowSupportTooltip(!showSupportTooltip)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg hover:shadow-emerald-200 transition-all active:scale-95 group"
              >
                <FaHeadset className="text-sm group-hover:rotate-12 transition-transform" />
                <span>Need Support?</span>
              </button>

              {showSupportTooltip && (
                <div className="absolute top-full right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                        <FaPhoneAlt size={12} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Phone Support</p>
                        <p className="text-xs font-black text-slate-700">9211133333</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                        <FaEnvelope size={12} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Email ID</p>
                        <p className="text-xs font-black text-slate-700">info@elloindia.in</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-slate-50 text-center">
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">Support available 11 am to 9pm</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {activeTab === 'modules' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1"><SubscriptionStatus /></div>
            <div className="lg:col-span-2"><ModuleSelector /></div>
          </div>
        )}
        {activeTab === 'videos' && <VideoManagement />}
        {activeTab === 'instructions' && <AISystemInstructions />}
        {activeTab === 'qa' && <QAManagement />}
        {activeTab === 'voice' && <VoiceSettings />}
      </main>

      {/* --- SYSTEM SPECS MODAL --- */}
      {showSpecsModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSpecsModal(false)} />
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 p-8 text-white relative">
              <div className="relative z-10">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <FaServer className="text-indigo-400" /> System Audit
                </h2>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-2">Detected vs Recommended Specifications</p>
              </div>
              <div className="absolute top-0 right-0 p-8">
                 <div className={`px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg ${performanceRating.bg} ${performanceRating.color}`}>
                    {performanceRating.label}
                 </div>
              </div>
            </div>

            <div className="p-8">
              <div className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm mb-8">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detected (Your PC)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommended</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FaMicrochip className="text-slate-400" />
                          <span className="text-xs font-black text-slate-700">Processor</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">{systemSpecs?.cpuModel?.split('@')[0] || 'Unknown'} ({systemSpecs?.coreCount} Cores)</td>
                      <td className="px-6 py-4 text-xs font-bold text-indigo-600">8+ Logical Cores</td>
                      <td className="px-6 py-4 text-center">
                        {systemSpecs?.coreCount >= 8 ? <FaCheckCircle className="text-emerald-500 mx-auto" /> : <FaExclamationTriangle className="text-amber-500 mx-auto" />}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FaSdCard className="text-slate-400" />
                          <span className="text-xs font-black text-slate-700">Memory</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">{systemSpecs?.totalRAM} GB RAM</td>
                      <td className="px-6 py-4 text-xs font-bold text-indigo-600">16 GB Recommended</td>
                      <td className="px-6 py-4 text-center">
                        {systemSpecs?.totalRAM >= 16 ? <FaCheckCircle className="text-emerald-500 mx-auto" /> : (systemSpecs?.totalRAM >= 8 ? <FaInfoCircle className="text-blue-500 mx-auto" /> : <FaExclamationTriangle className="text-red-500 mx-auto" />)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <FaInfoCircle className="text-indigo-500" /> Expert Recommendation
                </h4>
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  {performanceRating.status === 'low' 
                    ? `Your current hardware is entry-level. To achieve "Instant AI Responses" and avoid lag during speech synthesis, we recommend upgrading to a PC with at least 8 Logical Cores and 16GB of RAM.`
                    : performanceRating.status === 'medium'
                    ? `Your PC is well-balanced for the AI. You are getting "Optimal" performance. Upgrading to 16GB RAM would make the voice switching and high-quality models even smoother.`
                    : `EXCELLENT! Your hardware is in the Elite tier. You can use any high-quality AI model and Voice Engine without any bottlenecks.`
                  }
                </p>
              </div>

              <button 
                onClick={() => setShowSpecsModal(false)}
                className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95"
              >
                CLOSE AUDIT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
