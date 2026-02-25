import React, { useState, useEffect } from 'react';
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
  const [transcript, setTranscript] = useState('');
  const isDesktop = isElectron();
  
  const { activeModule, loadModule, processQuestion } = useModule(); 

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

        if (primaryVideo && window.electronAPI?.playHologramVideo) {
            window.electronAPI.playHologramVideo(primaryVideo);
        }

        if (shouldSpeak) {
            window.speechSynthesis.cancel();
            const isPiperVoice = voiceSettings.voice?.includes('lessac') || voiceSettings.voice?.includes('kusal') || voiceSettings.voice?.startsWith('Piper');
            const cleaned = cleanTextForTTS(answer);

            if (isPiperVoice && window.electronAPI?.generateSpeech) {
                const res = await window.electronAPI.generateSpeech(cleaned, voiceSettings.voice);
                if (res.success && res.audioPath) {
                    const audio = new Audio(`file://${res.audioPath}`);
                    if (voiceSettings.volume) audio.volume = Math.min(voiceSettings.volume, 1.0);
                    audio.onended = () => window.electronAPI?.stopHologramVideo();
                    audio.play().catch(console.error);
                    return;
                }
            }
            
            const utter = new SpeechSynthesisUtterance(cleaned);
            utter.onend = () => window.electronAPI?.stopHologramVideo();
            if (voiceSettings.voice) {
                const selected = window.speechSynthesis.getVoices().find(v => v.name === voiceSettings.voice);
                if (selected) utter.voice = selected;
            }
            window.speechSynthesis.speak(utter);
        } else {
            setTimeout(() => window.electronAPI?.stopHologramVideo(), 5000);
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
    const { requestId, question, inputType, answer: providedAnswer, triggerVideo } = data;
    const isAIModule = activeModule === 'gemma' || activeModule === 'gemini';
    
    try {
        if ((providedAnswer || triggerVideo) && !isAIModule) {
            await handleDesktopActions(providedAnswer || "Processing...", inputType || 'text');
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
        const result = await processQuestion(question);
        const finalAnswer = result.success ? result.answer : "I couldn't process that request.";

        await handleDesktopActions(finalAnswer, inputType || 'text');

        if (window.electronAPI?.sendAIResponse && requestId) {
            window.electronAPI.sendAIResponse({ requestId, answer: finalAnswer, shouldSpeak: true });
        }
    } catch (err) {
        console.error('Request Error:', err);
    }
  };

  // Option 2: PC Voice implementation
  const toggleVoiceAssistant = async () => {
    if (isListening) {
        if (window.electronAPI?.stopSTT) {
            await window.electronAPI.stopSTT();
            setIsListening(false);
        }
    } else {
        if (window.electronAPI?.startSTT) {
            await window.electronAPI.startSTT();
            setIsListening(true);
        } else {
            alert("Offline Voice Assistant is only available on the Desktop application.");
        }
    }
  };

  useEffect(() => {
    if (window.electronAPI) {
        const unsubText = window.electronAPI.onSTTText((text) => {
            console.log('[OfflineVoice] Recognized:', text);
            handleInteractionRequest({ 
                requestId: `pc-voice-${Date.now()}`, 
                question: text, 
                inputType: 'voice' 
            });
        });

        const unsubStatus = window.electronAPI.onSTTStatus((status) => {
            console.log('[OfflineVoice] Status:', status);
            if (status === 'LISTENING') setIsListening(true);
            if (status === 'STOPPED' || status === 'OFFLINE') setIsListening(false);
        });

        const unsubError = window.electronAPI.onSTTError((err) => {
            console.error('[OfflineVoice] Error:', err);
            // alert(`Voice Error: ${err}`);
            setIsListening(false);
        });

        const unsubLevel = window.electronAPI.onSTTLevel((level) => {
            console.log(`[OfflineVoice] Mic Level: ${level}%`);
        });

        const unsubDiag = window.electronAPI.onSTTDiag((msg) => {
            console.log(`[OfflineVoice-DIAG] ${msg}`);
        });

        return () => {
            unsubText();
            unsubStatus();
            unsubError();
            unsubLevel();
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
    { id: 'instructions', name: 'Instructions', icon: <FaPenNib />, show: isAIAuthorized },
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
      {isListening && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse border-4 border-red-400">
                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                <span className="text-xl font-black tracking-tighter">{aiName.toUpperCase()} IS LISTENING...</span>
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
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all shadow-md active:scale-95 ${
                      isListening 
                      ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] animate-pulse'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'
                  }`}
                >
                  {isListening ? <FaStop /> : <FaMicrophone />}
                  <span>{isListening ? `STOP ${aiName.toUpperCase()}` : 'VOICE ASSISTANT'}</span>
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
