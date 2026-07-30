import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';
import { FaMicrochip, FaBrain, FaSyncAlt, FaDownload, FaCheckCircle, FaExclamationCircle, FaRobot } from 'react-icons/fa';
import { GEMINI_LIVE_VOICES, DEFAULT_LIVE_VOICE } from '../../services/geminiLive.service';

const AIStatusPanel = ({ onRequestSetup, activeTabId }) => {
  const { activeModule, getModuleInstance } = useModule();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState({ ollama: false, model: false, modelName: null });

  // Use activeTabId for configuration context, fallback to activeModule
  const effectiveModuleId = activeTabId || activeModule;
  const activeModuleInstance = getModuleInstance(effectiveModuleId);
  
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [liveVoice, setLiveVoice] = useState(localStorage.getItem('gemini_live_voice') || DEFAULT_LIVE_VOICE);

  const isGemini = effectiveModuleId === 'gemini';
  const isGemma = effectiveModuleId === 'gemma';

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [effectiveModuleId, activeModule]);

  const checkStatus = async () => {
    try {
      if (isGemma && activeModuleInstance) {
        const ollamaAvailable = await activeModuleInstance.checkOllamaAvailable();
        const modelAvailable = await activeModuleInstance.checkModelAvailable();
        setStatus({
          ollama: ollamaAvailable,
          model: !!modelAvailable,
          modelName: modelAvailable,
          engineType: activeModuleInstance.engineType
        });
      }

      if (isGemini) {
        setStatus({
          geminiOnline: navigator.onLine && !!apiKey
        });
      }
    } catch (err) {
      console.error('Status check failed:', err);
    }
  };

  const handleLiveVoiceChange = (voice) => {
    setLiveVoice(voice);
    localStorage.setItem('gemini_live_voice', voice);
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    if (activeModuleInstance && activeModuleInstance.setApiKey) {
      activeModuleInstance.setApiKey(apiKey);
    }
    window.dispatchEvent(new Event('gemini-key-updated'));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
    checkStatus();
  };

  const handleTest = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      if (!activeModuleInstance) {
        throw new Error('AI module not available');
      }

      const result = await activeModuleInstance.testConnection();
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentPreference = localStorage.getItem('ai_model') || 'gemma3:1b';

  return (
    <div className="card shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <FaRobot className="text-blue-600" /> {isGemini ? 'Cloud AI Settings' : 'Offline AI Status'}
        </h2>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
          (isGemini && status.geminiOnline) || (isGemma && status.ollama) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {isGemini ? (status.geminiOnline ? 'Online' : 'Disconnected') : (status.ollama ? 'Ready' : 'Stopped')}
        </span>
      </div>
      
      <div className="p-4">
        {/* Connection Mode Helper */}
        <div className={`mb-6 p-3 rounded-xl flex items-start gap-3 border ${isGemini ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'}`}>
          <div className={`mt-0.5 ${isGemini ? 'text-blue-600' : 'text-emerald-600'}`}>
            <FaCheckCircle />
          </div>
          <div>
            <p className={`text-xs font-bold mb-0.5 ${isGemini ? 'text-blue-950' : 'text-emerald-950'}`}>
              {isGemini ? 'Online Mode Active' : 'Private & Offline Mode Active'}
            </p>
            <p className={`text-[10px] leading-relaxed ${isGemini ? 'text-blue-700' : 'text-emerald-700'}`}>
              {isGemini
                ? 'Real-time voice call powered by Gemini Live — speak naturally, interrupt anytime, and Gemini replies in its own voice.'
                : 'Working locally on this computer. No data ever leaves your device.'}
            </p>
          </div>
        </div>

        {isGemini ? (
          /* ONLINE CONFIGURATION */
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Google Gemini API Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API Key..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button 
                  onClick={handleSaveApiKey}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Get one for free here</a>.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Live Voice</label>
              <select
                value={liveVoice}
                onChange={(e) => handleLiveVoiceChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {GEMINI_LIVE_VOICES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <p className="mt-2 text-[10px] text-slate-400">
                Gemini speaks in its own natural voice and automatically replies in whatever language you speak. Speech recognition and text-to-speech are handled by Gemini Live — no separate STT/TTS setup needed.
              </p>
            </div>
          </div>
        ) : (
          /* OFFLINE CONFIGURATION */
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
               <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl shadow-inner">
                  <div className="flex items-center gap-2 mb-2">
                     <FaMicrochip className="text-slate-400 text-xs" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Core AI Engine</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-sm font-bold text-slate-800">
                        {status.engineType === 'openai' ? 'LM Studio' : 'Ollama Core'}
                     </span>
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        status.ollama ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                     }`}>
                       {status.ollama ? 'Active' : 'Stopped'}
                     </span>
                  </div>
               </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl shadow-inner">
                 <div className="flex items-center gap-2 mb-2">
                    <FaBrain className="text-slate-400 text-xs" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Neural Intelligence</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">
                      {status.modelName ? (status.modelName.includes('gemma3:1b') ? 'Gemma 3 1B' : 'Gemma (Legacy)') : 'Missing'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      status.modelName?.includes('gemma3:1b') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {status.modelName?.includes('gemma3:1b') ? 'Verified' : 'Manual Setup'}
                    </span>
                 </div>
              </div>
            </div>

            {(!status.modelName || !status.modelName.includes('gemma3:1b')) && (
              <div className="mb-6 border-t border-dashed border-gray-200 pt-6">
                 <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                       <p className="text-[10px] font-bold text-blue-800 mb-1">Upgrade Intelligence Engine</p>
                       <p className="text-[10px] text-blue-600 mb-3">Install the high-speed Gemma 3 1B brain for offline assistant features.</p>
                       <div className="flex gap-2">
                          {status.ollama && (
                            <button 
                              onClick={onRequestSetup}
                              className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                            >
                              <FaDownload /> Setup AI Brain
                            </button>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
            <FaExclamationCircle className="text-red-500" />
            <p className="text-red-700 text-xs font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={loading || (isGemini ? !apiKey : (!status.ollama || !status.model))}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
            loading || (isGemini ? !apiKey : (!status.ollama || !status.model))
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {loading ? 'Processing...' : 'Test AI Connection'}
        </button>
      </div>
    </div>
  );
};

export default AIStatusPanel;

