import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import SubscriptionStatus from '../dashboard/SubscriptionStatus';
import ModuleSelector from '../dashboard/ModuleSelector';
import VideoManagement from './VideoManagement';
import QAManagement from './QAManagement';
import VoiceSettings from './VoiceSettings';
import { isElectron } from '../../utils/electron';
import { FaRobot, FaVideo, FaQuestionCircle, FaVolumeUp } from 'react-icons/fa';

const ClientDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('modules');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [localIp, setLocalIp] = useState(null);
  const isDesktop = isElectron();
  
  useEffect(() => {
    // FIX: Match casing from preload.js (getLocalIP)
    if (isDesktop && window.electronAPI && window.electronAPI.getLocalIP) {
        window.electronAPI.getLocalIP().then(ip => {
            console.log('[Dashboard] Local IP:', ip);
            setLocalIp(ip);
        }).catch(err => {
            console.error('[Dashboard] Failed to get IP:', err);
            setLocalIp('Error');
        });
    }
  }, [isDesktop]);
  
  useEffect(() => {
    let mounted = true;
    let retryTimer = null;

    let retryCount = 0;
    const syncSession = async () => {
      if (!user || !window.electronAPI || !window.electronAPI.setUserSession) return;
      
      const attemptId = ++retryCount;
      try {
        const sessionPayload = {
          email: user.email,
          role: user.role,
          expiryDate: localStorage.getItem('expiry_date') || null,
          models: user.models || []
        };
        
        console.log(`[${new Date().toISOString()}] 🔄 Sync Attempt #${attemptId}: Sending session payload:`, sessionPayload);
        
        const result = await window.electronAPI.setUserSession(sessionPayload);

        console.log(`[${new Date().toISOString()}] ℹ️ Sync Attempt #${attemptId} Response:`, result);

        if (result && result.success) {
          console.log(`✅ [${new Date().toISOString()}] Session Synced Successfully!`);
        } else {
          console.warn(`⚠️ [${new Date().toISOString()}] Desktop Server not ready (Attempt #${attemptId}). Retrying in 5s...`);
          if (mounted) {
            retryTimer = setTimeout(syncSession, 5000);
          }
        }
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Sync Attempt #${attemptId} FAILED:`, error);
        if (mounted) {
          retryTimer = setTimeout(syncSession, 5000);
        }
      }
    };

    syncSession();

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user]);

  // Handle Mobile Chat Requests Globally (Background Processing)
  const { activeModule, loadModule, processQuestion } = useModule(); 
  
  // Use Refs to keep listener stable (avoid re-registering)
  const activeModuleRef = React.useRef(activeModule);
  const userRef = React.useRef(user);
  
  // Update refs when state changes
  useEffect(() => {
    activeModuleRef.current = activeModule;
    userRef.current = user;
  }, [activeModule, user]);
  
  useEffect(() => {
    // Listener for mobile AI requests (Stable Instance)
    const handleMobileRequest = async (data) => {
        console.log('📱 [ClientDashboard] Received Mobile Request:', data);
        const { requestId, question: mobileQuestion, inputType } = data; // inputType from mobile

        try {
            // 1. Check/Wake Module using Ref
            let currentModule = activeModuleRef.current;
            const currentUser = userRef.current;
            
            if (!currentModule) {
                console.log('💤 No active module, auto-loading "gemma"...');
                
                // Check if user has gemma or gemini
                const models = currentUser?.models || [];
                const targetModel = models.includes('gemma') ? 'gemma' : (models.includes('gemini') ? 'gemini' : null);
                
                if (targetModel) {
                    console.log(`[SYNC_DEBUG] Auto-loading detected model: ${targetModel}`);
                    const loadResult = await loadModule(targetModel);
                    if (loadResult.success) {
                        currentModule = targetModel;
                        // Note: activeModuleRef will update in next render, but we have local var
                        console.log('✅ Auto-loaded module successfully:', targetModel);
                    } else {
                        throw new Error(`Failed to auto-load AI: ${loadResult.error}`);
                    }
                } else {
                    throw new Error('No compatible AI model found in subscription');
                }
            }

            // Process Question
            // Wait a moment for initialization if we just loaded
            if (!activeModuleRef.current) {
               await new Promise(r => setTimeout(r, 1000)); // Increased wait
            }

            const result = await processQuestion(mobileQuestion);
            const answer = result.success ? result.answer : "I'm sorry, I encountered an error processing that.";

            // Determine Interaction Mode
            let shouldSpeak = false;
            try {
                const voiceSettings = JSON.parse(localStorage.getItem('voice_settings') || '{}');
                const mode = voiceSettings.interactionMode || 'adaptive';
                
                // Default inputType to 'text' if undefined
                const effectiveInputType = inputType || 'text';
                
                if (mode === 'always_speak') {
                    shouldSpeak = true;
                } else if (mode === 'adaptive') {
                    // Speak if input was voice
                    if (effectiveInputType === 'voice') {
                        shouldSpeak = true;
                    }
                }
                
                console.log(`🗣️ Interaction Mode: ${mode}, Input: ${effectiveInputType} => Speak: ${shouldSpeak}`);

                // TRIGGER DESKTOP ACTIONS (Video + TTS)
                
                // 1. Play Primary Video
                const storedVideos = JSON.parse(localStorage.getItem('videos') || '[]');
                const primaryId = localStorage.getItem('primary_video');
                const primaryVideo = storedVideos.find(v => v.id == primaryId);

                if (primaryVideo && window.electronAPI && window.electronAPI.playHologramVideo) {
                    console.log(`[SYNC_DEBUG] 🎬 Triggering Primary Video: ${primaryVideo.name}`);
                    window.electronAPI.playHologramVideo(primaryVideo);
                }

                // 2. Desktop TTS
                if (shouldSpeak) {
                    console.log(`[SYNC_DEBUG] 🔊 Preparing Desktop TTS`);
                    window.speechSynthesis.cancel();

                    const isPiperVoice = voiceSettings.voice && (
                        voiceSettings.voice.includes('lessac') || 
                        voiceSettings.voice.includes('kusal') || 
                        voiceSettings.voice.startsWith('Piper')
                    );

                    if (isPiperVoice && window.electronAPI && window.electronAPI.generateSpeech) {
                        console.log(`[SYNC_DEBUG] ⚡ Using Piper Neural TTS`);
                        window.electronAPI.generateSpeech(answer, voiceSettings.voice)
                            .then(result => {
                                if (result.success && result.audioPath) {
                                    const audio = new Audio(`file://${result.audioPath}`);
                                    if (voiceSettings.volume) audio.volume = Math.min(voiceSettings.volume, 1.0);
                                    if (voiceSettings.rate) audio.playbackRate = voiceSettings.rate;

                                    // Predictive Early Stop
                                    const earlyStopInterval = setInterval(() => {
                                        if (audio.duration && audio.currentTime > 0) {
                                            const remaining = audio.duration - audio.currentTime;
                                            if (audio.duration > 2 && remaining < 0.3) {
                                                console.log(`[SYNC_DEBUG] ⚡ Early Stop Triggered`);
                                                if (window.electronAPI && window.electronAPI.stopHologramVideo) {
                                                    window.electronAPI.stopHologramVideo();
                                                }
                                                clearInterval(earlyStopInterval);
                                            }
                                        }
                                    }, 100);

                                    audio.onended = () => {
                                        clearInterval(earlyStopInterval);
                                        console.log(`[SYNC_DEBUG] ✅ Piper Audio ENDED`);
                                        if (window.electronAPI && window.electronAPI.stopHologramVideo) {
                                            window.electronAPI.stopHologramVideo();
                                        }
                                    };
                                    
                                    audio.play().catch(console.error);
                                }
                            })
                            .catch(console.error);
                        return;
                    }
                    
                    // STANDARD BROWSER TTS (Fallback)
                    const utterance = new SpeechSynthesisUtterance(answer);
                    utterance.onend = () => {
                        console.log(`[SYNC_DEBUG] ✅ TTS ENDED`);
                        if (window.electronAPI && window.electronAPI.stopHologramVideo) {
                            window.electronAPI.stopHologramVideo();
                        }
                    };
                    
                    if (voiceSettings.voice) {
                        const voices = window.speechSynthesis.getVoices();
                        const selectedVoice = voices.find(v => v.name === voiceSettings.voice);
                        if (selectedVoice) utterance.voice = selectedVoice;
                    }
                    if (voiceSettings.rate) utterance.rate = voiceSettings.rate;
                    if (voiceSettings.pitch) utterance.pitch = voiceSettings.pitch;
                    if (voiceSettings.volume) utterance.volume = voiceSettings.volume;

                    window.speechSynthesis.speak(utterance);
                } else {
                    // No speech, stop video timeout
                    setTimeout(() => {
                         if (window.electronAPI && window.electronAPI.stopHologramVideo) {
                            window.electronAPI.stopHologramVideo();
                        }
                    }, 5000);
                }

            } catch (e) {
                console.warn('[SYNC_DEBUG] Error in action trigger:', e);
            }

            // Send back to server (CRITICAL)
            if (window.electronAPI && window.electronAPI.sendAIResponse) {
                window.electronAPI.sendAIResponse({ 
                    requestId, 
                    answer, 
                    shouldSpeak 
                });
            }

        } catch (err) {
            console.error('❌ Error handling mobile request:', err);
            // Always respond with error
            if (window.electronAPI && window.electronAPI.sendAIResponse) {
                window.electronAPI.sendAIResponse({ 
                    requestId, 
                    answer: `Error: ${err.message || "I'm sorry, I encountered an error."}` 
                });
            }
        }
    };

    if (window.electronAPI && window.electronAPI.onMobileChatRequest) {
        console.log('🎧 Registering Global Mobile Chat Listener (Stable)');
        const unsubscribe = window.electronAPI.onMobileChatRequest(handleMobileRequest);
        
        let unsubscribeSimple = null;
        if (window.electronAPI.onMobileQuestion) {
             console.log('🎧 Registering Global Mobile Question Listener (Stable)');
             unsubscribeSimple = window.electronAPI.onMobileQuestion((data) => {
                 console.log('[SYNC_DEBUG] 📱 ClientDashboard received simple mobile question:', data);
                 handleMobileRequest({
                    requestId: 'simple-' + Date.now(),
                    question: data.question,
                    inputType: 'text'
                });
             });
        }

        return () => {
            console.log('🔌 Unregistering Mobile Listeners');
            if (unsubscribe) unsubscribe();
            if (unsubscribeSimple) unsubscribeSimple();
        };
    }
  }, []); // Empty dependency array = Stable Listener

  // Get purchased modules to filter tabs
  const purchasedModels = user?.models || [];
  const hasPredefined = purchasedModels.includes('predefined');

  const allTabs = [
    { id: 'modules', name: 'AI Modules', icon: <FaRobot /> },
    { id: 'videos', name: 'Videos', icon: <FaVideo /> },
    { id: 'qa', name: 'Q&A', icon: <FaQuestionCircle />, requiredModule: 'predefined' },
    { id: 'voice', name: 'Voice', icon: <FaVolumeUp /> }
  ];

  // Filter tabs based on module access
  const tabs = allTabs.filter(tab => {
    if (tab.requiredModule && !hasPredefined) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className={`bg-white shadow-sm ${isDesktop ? 'border-b border-gray-200' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FaRobot className="text-blue-600" />
                PreBot Client
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, {user?.companyName || user?.email}
                {isDesktop && <span className="ml-2 text-xs text-gray-400">(PC App)</span>}
              </p>
            </div>
            
            {/* IP Address Display */}
            {isDesktop && (
                <div className="hidden md:block bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Mobile Access IP</p>
                    <p className="text-lg font-bold text-blue-800 font-mono">
                        {localIp || 'Loading...'}
                    </p>
                </div>
            )}

            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2 text-lg">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'modules' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <SubscriptionStatus />
            </div>
            <div className="lg:col-span-2">
              <ModuleSelector />
            </div>
          </div>
        )}
        {activeTab === 'videos' && <VideoManagement />}
        {activeTab === 'qa' && <QAManagement />}
        {activeTab === 'voice' && <VoiceSettings />}
      </main>
    </div>
  );
};

export default ClientDashboard;






