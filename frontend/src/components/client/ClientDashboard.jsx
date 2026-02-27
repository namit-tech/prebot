import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import SubscriptionStatus from '../dashboard/SubscriptionStatus';
import ModuleSelector from '../dashboard/ModuleSelector';
import VideoManagement from './VideoManagement';
import QAManagement from './QAManagement';
import { FaRobot, FaVideo, FaQuestionCircle, FaVolumeUp, FaMicrophone, FaStop, FaPenNib } from 'react-icons/fa';
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false); // Waiting for unmute

  const resetBusyState = (source = 'unknown') => {
    console.log(`[Dashboard] Resetting Busy State (Source: ${source})`);
    setIsAIBusy(false);
    if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
    }
  };

  const playBeep = (type) => {
    try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'start') {
            osc.frequency.setValueAtTime(880, now); // A5
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1); // E6
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else {
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
        const processingId = localStorage.getItem('processing_video');
        const primaryVideo = storedVideos.find(v => v.id == primaryId);
        const processingVideo = storedVideos.find(v => v.id == processingId);

        // Switch to Primary Video for speaking, unless told otherwise
        if (primaryVideo && window.electronAPI?.playHologramVideo) {
            window.electronAPI.playHologramVideo(primaryVideo);
        }

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
                    window.electronAPI?.stopHologramVideo();
                    resetBusyState('tts_finished');
                    // Auto-restart monitoring for the next customer
                    toggleVoiceAssistant();
                }, 800);
            };

            if (isPiperVoice && window.electronAPI?.generateSpeech) {
                const res = await window.electronAPI.generateSpeech(cleaned, voiceSettings.voice);
                if (res.success && res.audioPath) {
                    const audio = new Audio(`file://${res.audioPath}`);
                    if (voiceSettings.volume) audio.volume = Math.min(voiceSettings.volume, 1.0);
                    audio.onended = onFinishedSpeaking;
                    audio.play().catch((err) => {
                        console.error(err);
                        setIsAIBusy(false);
                    });
                    return;
                }
            }
            
            const utter = new SpeechSynthesisUtterance(cleaned);
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
                // Auto-restart monitoring for the next customer
                toggleVoiceAssistant();
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

        // Play "Processing" video on hologram if available
        const processingId = localStorage.getItem('processing_video');
        if (processingId && window.electronAPI?.playHologramVideo) {
            const storedVideos = JSON.parse(localStorage.getItem('videos') || '[]');
            const pVideo = storedVideos.find(v => v.id == processingId);
            if (pVideo) window.electronAPI.playHologramVideo(pVideo);
        }

        if (!isAIModule) {
            // In Predefined mode, we ONLY handle manual answers
            if (providedAnswer) {
                await handleDesktopActions(providedAnswer, inputType || 'text');
            } else {
                console.log('[Dashboard] Predefined mode active but no manual answer provided - skipping processing');
                setIsAIBusy(false);
            }
            return;
        }

        let currentModule = activeModule;
        if (!currentModule) {
            const models = user?.models || [];
            const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : null);
            if (targetModel) {
                const loadResult = await loadModule(targetModel);
                if (loadResult.success) currentModule = targetModel;
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
    // If already monitoring or listening, stop everything
    if (isMonitoring || isListening) {
      playBeep('stop');
      
      // If we were actively recording, transcribe what we have
      if (isRecordingRef.current && mediaRecorderRef.current?.state === 'recording') {
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

    // === START MONITORING MODE ===
    if (isAIBusy || isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      monitorStreamRef.current = stream;

      // Create AnalyserNode for real-time audio level monitoring
      const monitorCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = monitorCtx.createMediaStreamSource(stream);
      const analyser = monitorCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceFrames = 0;
      const SILENCE_THRESHOLD = 10;    // Audio level below this = muted
      const UNMUTE_THRESHOLD = 15;     // Audio level above this = unmuted
      const MUTE_FRAMES_TO_STOP = 25;  // ~2.5s of silence (at 100ms intervals) = muted

      setIsMonitoring(true);
      playBeep('start');
      console.log('[Dashboard] 🟢 Monitoring started — waiting for mic UNMUTE...');

      // Monitor audio levels every 100ms
      monitorIntervalRef.current = setInterval(() => {
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
            setIsListening(true);
            setIsMonitoring(false);
            playBeep('start');
          }
        } else {
          // === RECORDING — WAITING FOR MUTE ===
          if (avgLevel < SILENCE_THRESHOLD) {
            silenceFrames++;
            if (silenceFrames >= MUTE_FRAMES_TO_STOP) {
              console.log(`[Dashboard] ⏹️ Mic MUTED (silence for ${(MUTE_FRAMES_TO_STOP * 100 / 1000).toFixed(1)}s) — Stopping & transcribing...`);
              playBeep('stop');
              isRecordingRef.current = false;
              if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop(); // Triggers onstop → transcribe
              }
            }
          } else {
            silenceFrames = 0; // Reset silence counter if sound detected
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
      console.log('🔄 [Dashboard] Switching to Q&A tab - Activating Predefined Module');
      await loadModule('predefined');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {(isMonitoring || isListening || isTranscribing) && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50">
            <div className={`px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse border-4 ${
              isTranscribing 
                ? 'bg-amber-500 text-white border-amber-300'
                : isListening
                ? 'bg-red-600 text-white border-red-400'
                : 'bg-green-600 text-white border-green-400'
            }`}>
                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                <span className="text-xl font-black tracking-tighter">
                  {isTranscribing 
                    ? 'PROCESSING YOUR VOICE...'
                    : isListening
                    ? `${aiName.toUpperCase()} IS LISTENING...`
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
                  disabled={isTranscribing}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all shadow-md active:scale-95 ${
                      isTranscribing
                      ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse cursor-wait'
                      : isListening 
                      ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] animate-pulse'
                      : isMonitoring
                      ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] animate-pulse'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'
                  }`}
                >
                  {isTranscribing ? <FaPenNib /> : isListening ? <FaStop /> : <FaMicrophone />}
                  <span>
                    {isTranscribing ? 'PROCESSING...' : isListening ? `STOP ${aiName.toUpperCase()}` : isMonitoring ? 'CANCEL' : 'VOICE ASSISTANT'}
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
              
              <button onClick={logout} className="ml-2 p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors shadow-sm">
                 <FaRobot className="text-xl" />
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
    </div>
  );
};

export default ClientDashboard;
