import React, { useState, useEffect, useRef } from 'react';

const SetupWizard = ({ isOpen, onClose, onComplete, targetModel = 'gemma2:9b' }) => {
  // Stages: 'idle', 'checking', 'installing_ollama', 'pulling_model', 'ready', 'error'
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0); // 0-100
  const [statusText, setStatusText] = useState('Initializing...');
  const [errorDetails, setErrorDetails] = useState(null);
  
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startAutomation();
    }
  }, [isOpen]);

  useEffect(() => {
    // Stage-based view management
  }, [stage]);

  const startAutomation = async () => {
    setStage('checking');
    setProgress(10);
    setStatusText('Checking system requirements...');
    setErrorDetails(null);

    if (!window.electronAPI) {
      handleError('This feature requires the desktop application.');
      return;
    }

    try {
      // 1. Check Ollama
      if (!check.installed) {
        await installOllama();
      } else {
        await checkModel();
      }
    } catch (err) {
      handleError(err.message);
    }
  };

  const installOllama = async () => {
    setStage('installing_ollama');
    setProgress(30);
    setStatusText('Installing AI Engine...');
    
    try {
      // addLog('Downloading installer...'); // Removed redundant log call
      const result = await window.electronAPI.ollamaInstall();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // addLog('Installer launched.'); // Removed redundant log call
      setStatusText('Please complete the engine installation if prompted...');

      // Poll for completion
      const interval = setInterval(async () => {
        const check = await window.electronAPI.ollamaCheck();
        if (check.installed) {
          clearInterval(interval);
          // addLog('Ollama installed successfully!'); // Removed redundant log call
          checkModel(); // Proceed to next step
        }
      }, 2000);

    } catch (err) {
      handleError('Failed to install AI Engine: ' + err.message);
    }
  };

  const checkModel = async () => {
    setStage('checking');
    setStatusText('Checking AI Model...');
    setProgress(50);

    const models = await window.electronAPI.ollamaList();
    const hasModel = models.some(m => m.name.includes(targetModel));

    if (hasModel) {
      finishSetup();
    } else {
      await downloadModel();
    }
  };

  const downloadModel = async () => {
    setStage('pulling_model');
    setStatusText('Downloading Offline AI Model (This may take a few minutes)...');
    setProgress(55);

    try {
      // Listen for progress
      const cleanup = window.electronAPI.onOllamaProgress((data) => {
        // Parse percentage
        if (data.output.includes('%')) {
            const match = data.output.match(/(\d+)%/);
            if (match) {
                const percent = parseInt(match[1]);
                const totalProgress = 55 + (percent * 0.4);
                setProgress(Math.floor(totalProgress));
            }
        }
      });

      const result = await window.electronAPI.ollamaPull(targetModel);
      cleanup();

      if (result.success) {
        finishSetup();
      } else {
        throw new Error('Download failed: ' + result.error);
      }
    } catch (err) {
      handleError(err.message);
    }
  };

  const finishSetup = () => {
    setStage('ready');
    setProgress(100);
    setStatusText('Setup Complete!');
    
    // Auto-close after 1.5s
    setTimeout(() => {
        onComplete();
    }, 1500);
  };

  const handleError = (msg) => {
    setStage('error');
    setErrorDetails(msg);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-center">
          <h2 className="text-2xl font-bold text-white">
            🚀 Setting Up Offline AI
          </h2>
          <p className="text-blue-100 mt-1">Please wait while we configure your system</p>
        </div>

        {/* Content */}
        <div className="p-8">
          
          {stage === 'error' ? (
             <div className="text-center">
                <div className="text-red-500 text-5xl mb-4">❌</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Setup Failed</h3>
                <p className="text-gray-600 mb-6">{errorDetails}</p>
                <div className="flex gap-3 justify-center">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={startAutomation}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
             </div>
          ) : stage === 'ready' ? (
             <div className="text-center py-6">
                <div className="text-green-500 text-5xl mb-4 animate-bounce">✅</div>
                <h3 className="text-xl font-bold text-gray-800">All Set!</h3>
                <p className="text-gray-600">Launching AI...</p>
             </div>
          ) : (
             <div className="text-center">
                
                {/* Status Text */}
                <h3 className="text-lg font-medium text-gray-800 mb-6">
                    {statusText}
                </h3>

                {/* Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-4 mb-2 overflow-hidden">
                    <div 
                        className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-8">
                    <span>0%</span>
                    <span>{progress}%</span>
                    <span>100%</span>
                </div>

                {/* Spinner */}
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>

                {stage === 'installing_ollama' && (
                    <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                        🔔 An installation may be finishing in the background.<br/>
                        Please wait for the process to complete.
                    </div>
                )}
             </div>
          )}


        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
