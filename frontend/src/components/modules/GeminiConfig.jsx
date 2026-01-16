import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';

const GemmaConfig = () => {
  const { getModuleInstance } = useModule();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState({ ollama: false, model: false });

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
        model: modelAvailable
      });
    } catch (err) {
      setStatus({ ollama: false, model: false });
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

  return (
    <div className="card">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Offline AI Status</h2>
      
      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-green-800 text-sm font-medium mb-1">
          ✅ Private & Secure
        </p>
        <p className="text-green-700 text-xs">
          Your AI assistant works completely offline. No data leaves your device.
        </p>
      </div>

      {/* Status Indicators */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">AI Engine:</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            status.ollama 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {status.ollama ? '✅ Ready' : '❌ Not Ready'}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Intelligence Model:</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            status.model 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {status.model ? '✅ Loaded' : '❌ Missing'}
          </span>
        </div>
      </div>

      {!status.ollama && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm font-medium mb-2">
            ⚠️ AI Engine Not Running
          </p>
          <div className="text-yellow-700 text-xs space-y-1">
            <p>The AI engine is required for offline functionality.</p>
          </div>
        </div>
      )}

      {status.ollama && !status.model && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm font-medium mb-2">
            ⚠️ Model Not Installed
          </p>
          <div className="text-yellow-700 text-xs space-y-1">
            <p>The intelligence model is missing. Please contact support or restart the app.</p>
          </div>
        </div>
      )}

      {status.ollama && status.model && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm font-medium">
            ✅ Offline AI is ready to use!
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm">✅ Connection test successful!</p>
        </div>
      )}

      <button
        onClick={handleTest}
        disabled={loading || !status.ollama || !status.model}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Testing...' : 'Test Connection'}
      </button>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-800 text-xs font-medium mb-1">💡 Setup Instructions:</p>
        <p className="text-blue-700 text-xs">
           If the AI is not working, please try restarting the application or re-run the Setup Wizard.
        </p>
      </div>
    </div>
  );
};

export default GemmaConfig;

