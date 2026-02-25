import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';
import { FaMicrochip, FaBrain, FaSyncAlt, FaDownload, FaCheckCircle, FaExclamationCircle, FaRobot } from 'react-icons/fa';

const GemmaConfig = ({ onRequestSetup }) => {
  const { getModuleInstance } = useModule();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState({ ollama: false, model: false, modelName: null });

  const gemmaModule = getModuleInstance('gemma') || getModuleInstance('gemini');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    if (!gemmaModule) return;

    try {
      const ollamaAvailable = await gemmaModule.checkOllamaAvailable();
      const modelAvailable = await gemmaModule.checkModelAvailable();
      
      setStatus({
        ollama: ollamaAvailable,
        model: !!modelAvailable,
        modelName: modelAvailable
      });
    } catch (err) {
      setStatus({ ollama: false, model: false, modelName: null });
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      if (!gemmaModule) {
        throw new Error('Gemma module not available');
      }

      const result = await gemmaModule.testConnection();
      
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

  const currentPreference = localStorage.getItem('ai_model') || 'gemma2:2b';
  const otherModel = currentPreference === 'gemma2:2b' ? 'gemma2:9b' : 'gemma2:2b';
  const otherModelLabel = otherModel === 'gemma2:9b' ? 'Premium (9B)' : 'Standard (2B)';

  const handleSwitchModel = (modelId) => {
    localStorage.setItem('ai_model', modelId);
    checkStatus();
  };

  return (
    <div className="card shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <FaRobot className="text-blue-600" /> Offline AI Status
        </h2>
        {status.model && (
          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold uppercase">
            Active: {status.modelName?.includes('9b') ? 'Premium' : 'Standard'}
          </span>
        )}
      </div>
      
      <div className="p-4">
        {/* Security Banner */}
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3">
          <div className="mt-0.5 text-emerald-600">
            <FaCheckCircle />
          </div>
          <div>
            <p className="text-emerald-950 text-xs font-bold mb-0.5">
              Private & Encrypted
            </p>
            <p className="text-emerald-700 text-[10px] leading-relaxed">
              Your AI assistant works completely offline. No data ever leaves this computer.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
             <div className="flex items-center gap-2 mb-2">
                <FaMicrochip className="text-slate-400 text-xs" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">AI Engine</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Ollama Core</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  status.ollama ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {status.ollama ? 'Ready' : 'Stopped'}
                </span>
             </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
             <div className="flex items-center gap-2 mb-2">
                <FaBrain className="text-slate-400 text-xs" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Intelligence Model</span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">
                  {status.modelName ? (status.modelName.includes('9b') ? 'Gemma 9B' : 'Gemma 2B') : 'None'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  status.model ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {status.model ? 'Loaded' : 'Missing'}
                </span>
             </div>
          </div>
        </div>

        {/* Model Switching Logic */}
        <div className="mb-6 border-t border-dashed border-gray-200 pt-6">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Model Management</p>
           
           <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                 <p className="text-[10px] font-bold text-blue-800 mb-1">Switch Intelligence</p>
                 <p className="text-[10px] text-blue-600 mb-3">Choose between speed or high reasoning.</p>
                 <div className="flex gap-2">
                    <button 
                      onClick={() => handleSwitchModel(otherModel)}
                      className="flex items-center gap-2 bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors shadow-sm"
                    >
                      <FaSyncAlt /> Use {otherModelLabel}
                    </button>
                    {!status.model && status.ollama && (
                      <button 
                        onClick={onRequestSetup}
                        className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        <FaDownload /> Download Now
                      </button>
                    )}
                 </div>
              </div>
           </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
            <FaExclamationCircle className="text-red-500" />
            <p className="text-red-700 text-xs font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={loading || !status.ollama || !status.model}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
            loading || !status.ollama || !status.model
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {loading ? 'Processing...' : 'Test AI Connection'}
        </button>
      </div>

      <div className="bg-slate-50 p-3 border-t border-gray-100 px-4">
        <p className="text-slate-500 text-[10px] leading-relaxed">
          <span className="font-bold text-slate-700 uppercase mr-1">💡 Troubleshooting:</span>
          If AI is not responding, try switching models or use the <strong>Download Now</strong> button above to ensure all data is correctly installed.
        </p>
      </div>
    </div>
  );
};

export default GemmaConfig;

