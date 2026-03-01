import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import SubscriptionStatus from '../dashboard/SubscriptionStatus';
import ModuleSelector from '../dashboard/ModuleSelector';
import VideoManagement from './VideoManagement';
import QAManagement from './QAManagement';
import { FaRobot, FaVideo, FaQuestionCircle, FaVolumeUp, FaMicrophone, FaStop, FaPenNib, FaHandPaper, FaSignOutAlt, FaMicrochip, FaSdCard, FaExclamationTriangle, FaCheckCircle, FaInfoCircle, FaServer } from 'react-icons/fa';
import AISystemInstructions from './AISystemInstructions';
import VoiceSettings from './VoiceSettings';
import { isElectron } from '../../utils/electron';

const ClientDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('modules');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [localIp, setLocalIp] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isAIBusy, setIsAIBusy] = useState(false);
  const isDesktop = isElectron();
  
  const { activeModule, loadModule, processQuestion } = useModule(); 
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

  useEffect(() => {
    if (window.electronAPI?.getSystemSpecs) {
      window.electronAPI.getSystemSpecs().then(result => {
        if (result.success) setSystemSpecs(result.specs);
      });
    }
  }, []);

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
            case 'analog_boot': sentence = "System ready."; break;
            case 'tickle': sentence = "Yes? How can I help?"; break;
            case 'process_p1': sentence = "One moment, processing."; break;
            default: return;
        }

        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(sentence);
        
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

  const playBeep = (type) => {
    console.log(`[Audio] 🔊 synthesize audio requested: ${type}`);
    
    // If Voice Guide is ON, speak the sentence instead of beeping
    const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    if (voiceSettings.voiceGuide) {
        playVoiceGuide(type);
        return;
    }

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
            
            // Watchdog: Force reset after 15 seconds if it gets stuck
            if (watchdogRef.current) clearTimeout(watchdogRef.current);
            watchdogRef.current = setTimeout(() => {
                console.warn('[Dashboard] Watchdog Reset: AI was busy for too long.');
                resetBusyState('watchdog');
            }, 15000);

            window.speechSynthesis.cancel();
            const isPiperVoice = voiceSettings.voice?.includes('lessac') || voiceSettings.voice?.includes('kusal') || voiceSettings.voice?.startsWith('Piper');
            const cleaned = cleanTextForTTS(answer);

            const onFinishedSpeaking = () => {
                // Wait for echo to dissipate before listening again
                setTimeout(() => {
                    if (pipelineStartRef.current) {
                        const totalTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
                        console.log(`[⏱️ TIMER] TTS finished speaking`);
                        console.log(`[⏱️ TIMER] ═══ TOTAL PIPELINE: ${totalTime}s ═══`);
                        pipelineStartRef.current = null;
                    }
                    console.log('[Dashboard] 🎬 Stopping PRIMARY video (TTS ended)');
                    window.electronAPI?.stopHologramVideo();
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
                    audio.play().catch((err) => {
                        console.error(err);
                        setIsAIBusy(false);
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

  const handleInteractionRequest = async (data) => {
    const { question, providedAnswer, triggerVideo, inputType, requestId } = data;
    const isAIModule = activeModule === 'gemma' || activeModule === 'gemini';

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

        // If we are in predefined mode, check for predefined answer FIRST
        let currentModule = activeModule;
        
        if (!isAIModule) {
            // Check if user has predefined Q&A
            const predefinedDataStr = localStorage.getItem('predefined_qa');
            if (predefinedDataStr) {
                try {
                    const QA = JSON.parse(predefinedDataStr);
                    const qLower = (question || "").toLowerCase();
                    const match = QA.find(qa => qa.question.toLowerCase() === qLower);
                    
                    if (match && match.ai) {
                        console.log(`[Dashboard] Predefined answer requires AI: ${match.ai}`);
                        const loadResult = await loadModule(match.ai);
                        if (loadResult.success) {
                            currentModule = match.ai;
                        }
                    } else if (match && !match.ai) {
                        console.log('[Dashboard] Found exact Predefined match without AI');
                        await handleDesktopActions(match.answer, inputType || 'text');
                        return; // Done
                    } else if (!match) {
                        // See if user has AI models to fallback to
                        const models = user?.models || [];
                        const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : null);
                        if (targetModel) {
                            console.log(`[Dashboard] No predefined match, falling back to AI: ${targetModel}`);
                            const loadResult = await loadModule(targetModel);
                            if (loadResult.success) currentModule = targetModel;
                        } else {
                            console.log('[Dashboard] Predefined mode active but no manual answer provided - skipping processing');
                            setIsAIBusy(false);
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Error parsing predefined QA', e);
                }
            } else if (providedAnswer) {
                 await handleDesktopActions(providedAnswer, inputType || 'text');
                 return;
            } else {
                console.log('[Dashboard] Predefined mode active but no manual answer or QA provided - skipping processing');
                setIsAIBusy(false);
                return;
            }
        } else {
            // Already in AI mode, ensure module loaded
            if (!currentModule) {
                const models = user?.models || [];
                const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : null);
                if (targetModel) {
                    const loadResult = await loadModule(targetModel);
                    if (loadResult.success) currentModule = targetModel;
                }
            }
        }

        await new Promise(r => setTimeout(r, 600));
        const result = await processQuestion(question).catch(err => {
            console.error('[Dashboard] Question processing failed:', err);
            return { success: false };
        });

        const finalAnswer = result.success ? result.answer : "I couldn't process that request.";
        const aiTime = ((performance.now() - aiStartTime) / 1000).toFixed(2);
        console.log(`[⏱️ TIMER] AI response received in ${aiTime}s`);
        console.log(`[⏱️ TIMER] Starting TTS...`);

        await handleDesktopActions(finalAnswer, inputType || 'text');

        if (window.electronAPI?.sendAIResponse && requestId) {
            window.electronAPI.sendAIResponse({ requestId, answer: finalAnswer, shouldSpeak: true });
        }
    } catch (err) {
        console.error('Request Error:', err);
        resetBusyState('request_error'); // Reset on error
    }
  };

  // === MUTE-BUTTON TRIGGERED VOICE ASSISTANT ===
  // Flow: Click Voice → Monitoring (green) → Unmute mic → Recording (red) → Mute mic → Transcribe (amber) → AI responds
  
  // Auto-restart: use correct mode
  const autoRestartListening = () => {
    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    if (vs.handsFreeMode) {
      // Client demanded Continuous Conversation: Instead of wake word (P1), jump to Question (P2)
      // We start it in "Follow-Up" mode to enforce the 5-second silence timeout!
      console.log('[Dashboard] Entering 5-Second Follow-Up Mode...');
      startQuestionRecording(true);
    } else {
      toggleVoiceAssistant();
    }
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
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
        // Enforce an aggressive 3500ms DEAF PERIOD so the microphone completely ignores the Wake Word mechanical beep
        if (performance.now() - audioCaptureStartTime < 3000) return;

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

  // === PHASE 1: Listen for wake word ===
  const startHandsFreeListening = () => {
    if (isAIBusy || isTranscribing) return;

    const vs = JSON.parse(localStorage.getItem('voice_settings') || '{}');
    const wakeWord = (vs.wakeWord || 'hello prebot').toLowerCase().trim();

    handsFreeActiveRef.current = true; // Mark hands-free as active
    playBeep('analog_boot'); // Completely different mechanical sweep sound
    console.log(`[HandsFree-P1] 🎙️ Waiting for wake word: "${wakeWord}"...`);

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
          console.log(`[HandsFree-P1] Heard: "${fullText}"`);

          const isMatch = fuzzyMatch(fullText, wakeWord);
          if (isMatch) {
            console.log(`[HandsFree-P1] ✅ Wake word MATCHED! Starting Phase 2 (question recording)...`);
            playBeep('tickle'); // Arpeggio confirmation!
            setTimeout(() => startQuestionRecording(), 600); // Give the tickle arpeggio time to play before starting P2
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

  // === PHASE 2: Record the question ===
  const startQuestionRecording = (isFollowUp = false) => {
    if (isFollowUp) {
      console.log(`[HandsFree-P2] 🎤 Follow-Up Window Open! (5 seconds to speak)`);
      // Optional: Play a tiny double-blip so the user knows they can speak immediately
      playBeep('process_p1');
    } else {
      console.log(`[HandsFree-P2] 🎤 Ready for question — speak now...`);
    }

    startAudioCapture(2, async (audioBlob) => {
      // Check cancellation flag
      if (!handsFreeActiveRef.current) {
        console.log('[HandsFree-P2] Cancelled, stopping.');
        setIsTranscribing(false);
        return;
      }

      if (audioBlob.size < 1000) {
        if (isFollowUp) {
           console.log('[HandsFree-P2] 5s Follow-Up Window Closed. Going back to sleep...');
           // Timeout reached: Go back to P1 (Wake Word)
           if (handsFreeActiveRef.current) startHandsFreeListening();
        } else {
           console.log('[HandsFree-P2] Too short, back to wake word...');
           if (handsFreeActiveRef.current) autoRestartListening();
        }
        return;
      }

      console.log(`[HandsFree-P2] Question captured: ${audioBlob.size} bytes — Transcribing...`);
      pipelineStartRef.current = performance.now();
      console.log(`[⏱️ TIMER] Pipeline started — Transcribing question...`);
      startThinkingVideo(); // Trigger hologram video early during transcription!
      setIsTranscribing(true);

      try {
        const result = await transcribeBlob(audioBlob);

        // Check cancellation AFTER transcription completes
        if (!handsFreeActiveRef.current) {
          console.log('[HandsFree-P2] Cancelled during transcription, discarding result.');
          setIsTranscribing(false);
          return;
        }

        const transcribeTime = ((performance.now() - pipelineStartRef.current) / 1000).toFixed(2);
        console.log(`[⏱️ TIMER] Question transcription done in ${transcribeTime}s`);
        setIsTranscribing(false);

        if (result.success && result.text && result.text.trim()) {
          const question = result.text.trim();
          
          // Filter out Whisper hallucinating background noise as e.g. "(chatter)", "(clicking)", "[silence]"
          if ((question.startsWith('(') && question.endsWith(')')) || (question.startsWith('[') && question.endsWith(']'))) {
             console.log(`[HandsFree-P2] ❌ Ignored background noise transcription: "${question}"`);
             if (handsFreeActiveRef.current) startHandsFreeListening(); // Back to Wake Word
             return;
          }

          console.log(`[HandsFree-P2] ✅ Question: "${question}" — Sending to AI...`);
          const requestId = `hf-voice-${Date.now()}`;
          handleInteractionRequest({
            requestId,
            question,
            inputType: 'voice'
          });
        } else {
          console.log('[HandsFree-P2] Empty transcription — back to wake word...');
          if (handsFreeActiveRef.current) startHandsFreeListening();
        }
      } catch (err) {
        console.error('[HandsFree-P2] Error:', err);
        setIsTranscribing(false);
        if (handsFreeActiveRef.current) startHandsFreeListening();
      }
    }, isFollowUp);
  };

  // === STOP HANDS-FREE (full cleanup + cancellation) ===
  const stopHandsFree = () => {
    console.log('[HandsFree] ⏹️ CANCEL — Stopping hands-free mode.');
    handsFreeActiveRef.current = false; // Prevent all async callbacks from restarting
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

    // If already active in any mode, stop everything
    if (isMonitoring || isListening || isWakeWordListening || (isTranscribing && isHandsFree)) {
      playBeep('stop');
      
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
      startHandsFreeListening();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      monitorStreamRef.current = stream;

      // Create AnalyserNode for real-time audio level monitoring
      const monitorCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = monitorCtx.createMediaStreamSource(stream);
      const analyser = monitorCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceFrames = 0;
      let speechFrames = 0;
      let hasSpoken = false;
      const SILENCE_THRESHOLD = 10;    // Audio level below this = muted
      const UNMUTE_THRESHOLD = 15;     // Audio level above this = unmuted
      const MIN_SPEECH_FRAMES = 5;
      const IDLE_FRAMES_TO_STOP = 50;  // 5.0s of thinking time before aborting
      const MUTE_FRAMES_TO_STOP = 10;  // 1.0s of silence after speech to submit

      setIsMonitoring(true);
      playBeep('analog_boot'); // Completely different mechanical sweep sound
      console.log('[Dashboard] 🟢 Monitoring started — waiting for mic UNMUTE...');

      const monitorStartTime = performance.now();

      // Monitor audio levels every 100ms
      monitorIntervalRef.current = setInterval(() => {
        // Enforce an aggressive 3500ms DEAF PERIOD so the microphone ignores the mechanical beep
        if (performance.now() - monitorStartTime < 3000) return;

        analyser.getByteFrequencyData(dataArray);
        const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (!isRecordingRef.current) {
          // === WAITING FOR UNMUTE ===
          if (avgLevel > UNMUTE_THRESHOLD) {
            console.log(`[Dashboard] 🔴 Mic UNMUTED (level: ${avgLevel.toFixed(1)}) — Recording started!`);
            
            // Start MediaRecorder
            audioChunksRef.current = [];
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };
            mediaRecorder.onstop = async () => {
              // Clean up the monitoring stream
              if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
              monitorIntervalRef.current = null;
              monitorStreamRef.current?.getTracks().forEach(track => track.stop());
              monitorStreamRef.current = null;
              monitorCtx.close();
              
              setIsListening(false);
              setIsMonitoring(false);
              await transcribeAndSend();
              // Note: auto-restart is handled in handleDesktopActions after AI responds
            };
            
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(250);
            isRecordingRef.current = true;
            silenceFrames = 0;
            speechFrames = 1;
            hasSpoken = false;
            setIsListening(true);
            setIsMonitoring(false);
            playBeep('start');
          }
        } else {
          // === RECORDING — WAITING FOR MUTE ===
          if (avgLevel > UNMUTE_THRESHOLD) {
            speechFrames++;
            silenceFrames = 0; // Reset silence counter if sound detected
            if (speechFrames >= MIN_SPEECH_FRAMES) hasSpoken = true;
          } else {
            silenceFrames++;
            const currentTimeout = hasSpoken ? MUTE_FRAMES_TO_STOP : IDLE_FRAMES_TO_STOP;
            if (silenceFrames >= currentTimeout) {
              console.log(`[Dashboard] ⏹️ Mic MUTED (silence for ${(currentTimeout * 100 / 1000).toFixed(1)}s) — Stopping & transcribing...`);
              playBeep('stop');
              isRecordingRef.current = false;
              if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop(); // Triggers onstop → transcribe
              }
            }
          }
        }
      }, 100);

    } catch (err) {
      console.error('[Dashboard] Microphone access denied:', err);
      alert('Microphone access denied. Please allow microphone access in your system settings.');
    }
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

  const isAIAuthorized = (user?.models || []).includes('gemma') || (user?.models || []).includes('gemini') || user?.role === 'superadmin';
  const aiName = isAIAuthorized ? 'AI' : 'Predefined';

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
