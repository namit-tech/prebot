import React, { useState, useEffect, useRef } from 'react';
import { FaRobot, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaCog } from 'react-icons/fa';

/**
 * Ollama Setup Wizard
 * Auto-configures Ollama CORS for first-time users
 */
const OllamaSetupWizard = ({ onComplete, onSkip, targetModel: defaultTarget }) => {
  const [step, setStep] = useState('checking'); // checking, needs-setup, configuring, model-selection, pulling-model, success, error
  const [setupStatus, setSetupStatus] = useState(null);
  const [configSteps, setConfigSteps] = useState([]);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const logEndRef = useRef(null);


  useEffect(() => {
    // Silent progress listener
    const cleanup = window.electronAPI.onOllamaLog((msg) => {
      // Parse percentage: "pulling 7462734796d6:  27%"
      if (msg.includes('%')) {
        const match = msg.match(/(\d+)%/);
        if (match) setPullProgress(parseInt(match[1]));
      }
      // Parse speed: "12 MB/s"
      if (msg.includes('B/s')) {
        const match = msg.match(/(\d+(?:\.\d+)?\s*[KMG]B\/s)/);
        if (match) setDownloadSpeed(match[1]);
      }
    });

    const target = defaultTarget || localStorage.getItem('ai_model') || 'gemma3:1b';
    checkSetup(target);

    return () => cleanup();
  }, [defaultTarget]);
  
  // Polling removed to prevent race conditions with installer cleanup.
  // The handleInstall promise itself will handle the transition.
  
  const handleInstall = async () => {
    console.log('Wizard: handleInstall clicked');
    try {
      setIsInstalling(true);
      setError(null);
      const result = await window.electronAPI.ollamaInstall();
      console.log('Wizard: Install request result:', result);
      
      setIsInstalling(false); // Stop installing state before check
      
      if (result.success) {
        // Refresh setup status and move to next logical step
        const target = defaultTarget || localStorage.getItem('ai_model') || 'gemma3:1b';
        await checkSetup(target);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Wizard: Install error:', err);
      setError(err.message);
      setIsInstalling(false);
    }
  };

  const checkSetup = async (targetModel = null) => {
    console.log('Wizard: checkSetup called');
    try {
      setStep('checking');
      setError(null);
      
      if (!window.electronAPI || !window.electronAPI.ollamaCheckSetup) {
        console.error('Wizard: electronAPI not found');
        setError('Ollama setup API not available');
        setStep('error');
        return;
      }

      const checkTarget = targetModel || defaultTarget || localStorage.getItem('ai_model') || 'gemma3:1b';
      console.log('Wizard: Invoking ollamaCheckSetup...');
      const result = await window.electronAPI.ollamaCheckSetup();
      console.log('Wizard: checkSetup result:', result);
      
      if (result.success) {
        setSetupStatus(result.details);
        
        if (result.configured) {
          // If engine is configured, WE MUST check if the target model actually exists
          console.log('Wizard: Engine ready. Verifying model list via ollamaVerify...');
          const verifyResult = await window.electronAPI.ollamaVerify();
          
          if (verifyResult.success && verifyResult.models) {
             const hasTarget = verifyResult.models.some(m => m.includes(checkTarget));
             
             if (hasTarget) {
               console.log(`Wizard: Already configured with ${checkTarget}! Auto-completing...`);
               setStep('success');
               setTimeout(() => onComplete(), 2000);
             } else {
               console.log(`Wizard: ${checkTarget} not found in available models:`, verifyResult.models);
               setStep('model-selection');
             }
          } else {
             console.log('Wizard: Failed to verify model list. Moving to selection anyway.');
             setStep('model-selection');
          }
        } else {
          setStep('needs-setup');
        }
      } else {
        setError(result.error);
        setStep('error');
      }
    } catch (err) {
      console.error('Wizard: checkSetup error:', err);
      setError(err.message);
      setStep('error');
    }
  };

  const handleConfigure = async () => {
    console.log('Wizard: handleConfigure clicked');
    try {
      setStep('configuring');
      setConfigSteps([]);
      setError(null);

      const result = await window.electronAPI.ollamaConfigure();
      console.log('Wizard: configure result:', result);
      
      if (result.success) {
        setConfigSteps(result.steps || []);
        
        // After configuration, check for models
        const preferred = localStorage.getItem('ai_model') || 'gemma3:1b';
        const checkResult = await window.electronAPI.ollamaCheckSetup(preferred);
        if (checkResult.success && !checkResult.configured) {
           setStep('model-selection');
        } else {
           setStep('success');
           // Auto-complete after showing success
           setTimeout(() => {
             if (onComplete) onComplete();
           }, 3000);
        }
      } else {
        setError(result.error || result.message);
        setStep('error');
      }
    } catch (err) {
      console.error('Wizard: configure error:', err);
      setError(err.message);
      setStep('error');
    }
  };

  const handleModelSelect = async (modelName) => {
    console.log('Wizard: handleModelSelect clicked', modelName);
    try {
      setStep('pulling-model');
      setIsPulling(true);
      setPullProgress(0);
      setDownloadSpeed('');
      setError(null);

      const result = await window.electronAPI.ollamaInstallModel(modelName);
      console.log('Wizard: pull result:', result);
      
      if (result.success) {
        // Persist model preference locally
        localStorage.setItem('ai_model', modelName);
        console.log(`💾 Wizard: Saved AI model preference: ${modelName}`);
        
        setStep('success');
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 3000);
      } else {
        setError(result.error);
        setStep('error');
      }
    } catch (err) {
      console.error('Wizard: pull error:', err);
      setError(err.message);
      setStep('error');
    } finally {
      setIsPulling(false);
    }
  };

  const renderStepIndicator = (stepStatus) => {
    if (stepStatus === 'success') {
      return <FaCheckCircle className="text-green-500" />;
    } else if (stepStatus === 'failed') {
      return <FaExclamationTriangle className="text-red-500" />;
    } else if (stepStatus === 'warning') {
      return <FaExclamationTriangle className="text-yellow-500" />;
    } else {
      return <FaSpinner className="text-blue-500 animate-spin" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-8" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <FaRobot className="text-blue-600 text-3xl" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            System AI Setup
          </h2>
          <p className="text-gray-600">
            Configuring your local intelligence model
          </p>
        </div>

        {/* Checking Status */}
        {step === 'checking' && (
          <div className="text-center py-8">
            <FaSpinner className="text-blue-600 text-4xl animate-spin mx-auto mb-4" />
            <p className="text-gray-700 text-lg">Checking AI configuration...</p>
          </div>
        )}

        {/* Needs Setup */}
        {step === 'needs-setup' && (
          <div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <FaExclamationTriangle className="text-yellow-600 text-2xl mr-3 mt-1" />
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-2">
                    {setupStatus?.ollamaInstalled ? 'Configuration Required' : 'AI Core Not Found'}
                  </h3>
                  <p className="text-yellow-800 text-sm">
                    {setupStatus?.ollamaInstalled 
                      ? 'The AI Core needs to be configured to allow connections from this application.'
                      : 'An AI Core is required to run models locally. Please install it to continue.'}
                  </p>
                </div>
              </div>
            </div>

            {setupStatus && (
              <div className="mb-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">AI Core Installed:</span>
                  <span className={setupStatus.ollamaInstalled ? 'text-green-600' : 'text-red-600'}>
                    {setupStatus.ollamaInstalled ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">AI Core Running:</span>
                  <span className={setupStatus.ollamaRunning ? 'text-green-600' : 'text-red-600'}>
                    {setupStatus.ollamaRunning ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Connection Optimized:</span>
                  <span className={setupStatus.corsConfigured ? 'text-green-600' : 'text-yellow-600'}>
                    {setupStatus.corsConfigured ? '✓ Yes' : '⚠ No'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {!setupStatus?.ollamaInstalled ? (
                <button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  {isInstalling ? <FaSpinner className="animate-spin" /> : <FaCog />}
                  {isInstalling ? 'Installer Running...' : 'Setup AI Core'}
                </button>
              ) : (
                <button
                  onClick={handleConfigure}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  <FaCog className={step === 'configuring' ? "animate-spin" : ""} />
                  Auto-Configure Now
                </button>
              )}
              
              {onSkip && (
                <button
                  onClick={onSkip}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Skip for Now
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              {!setupStatus?.ollamaInstalled 
                ? 'Check the taskbar for the installer window. Follow the prompts to install.'
                : 'This will set an environment variable and restart Ollama. No admin privileges required.'}
            </p>
          </div>
        )}

        {/* Model Selection */}
        {step === 'model-selection' && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Connect to Intelligence</h3>
              <p className="text-blue-800 text-sm">
                To run offline, the system will download the efficient Gemma 3 1B brain.
              </p>
            </div>

            <div className="flex justify-center mb-6">
              <button 
                onClick={() => handleModelSelect('gemma3:1b')}
                className="w-full max-w-md p-6 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 text-center transition-all shadow-sm"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-xl text-gray-900 flex items-center gap-2">Gemma 3 1B</span>
                  <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">Recommended</span>
                </div>
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-gray-700 flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Ultra-Fast Response (Quantized)
                  </p>
                  <p className="text-sm text-gray-700 flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Recent Knowledge (Aug 2024)
                  </p>
                  <p className="text-sm text-gray-700 flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Low RAM Requirement (~1GB)
                  </p>
                </div>
                <div className="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors">
                  Setup This Model
                </div>
              </button>
            </div>

            <p className="text-center text-xs text-gray-400">
               Downloading intelligence data may take 5-10 minutes depending on your internet.
            </p>
          </div>
        )}

        {/* Pulling Model Progress */}
        {step === 'pulling-model' && (
          <div className="py-8 text-center">
            <div className="mb-6">
              <FaSpinner className="text-blue-600 text-5xl animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900">Downloading Intelligence...</h3>
              <p className="text-gray-600 mt-2">
                Downloading data to your local machine. Please don't close the app.
              </p>
            </div>
            
            <div className="w-full bg-gray-100 rounded-full h-6 mb-2 overflow-hidden border border-gray-200">
               <div 
                 className="bg-blue-600 h-full transition-all duration-300 ease-out flex items-center justify-end px-2" 
                 style={{ width: `${pullProgress}%` }}
               >
                 {pullProgress > 10 && <span className="text-[10px] text-white font-bold">{pullProgress}%</span>}
               </div>
            </div>
            
            <div className="flex justify-between text-xs text-gray-500 font-mono">
               <span>{downloadSpeed || 'Calculating speed...'}</span>
               {pullProgress <= 10 && <span>{pullProgress}%</span>}
               <span>{pullProgress >= 100 ? 'Finalizing...' : 'Estimated: 5-10m'}</span>
            </div>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
              <FaCheckCircle className="text-green-600 text-5xl" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Configuration Successful!
            </h3>
            <p className="text-gray-600 mb-6">
              Your AI Core is now ready and optimized.
            </p>

            {models.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-semibold text-green-900 mb-2">
                  System Capabilities:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="text-xs bg-white px-3 py-1 rounded-full border border-green-300 text-green-800">
                    Offline Processing Ready
                  </span>
                  <span className="text-xs bg-white px-3 py-1 rounded-full border border-green-300 text-green-800">
                    Neural Engine Active
                  </span>
                </div>
              </div>
            )}

            <p className="text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <FaExclamationTriangle className="text-red-600 text-2xl mr-3 mt-1" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-2">
                    Configuration Failed
                  </h3>
                  <p className="text-red-800 text-sm mb-3">
                    {error || 'An unexpected error occurred during setup.'}
                  </p>
                  <p className="text-red-700 text-xs">
                    You may need to configure Ollama manually. Please refer to the setup documentation.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  console.log('Wizard: Try Again clicked');
                  const preferred = localStorage.getItem('ai_model') || 'gemma2:2b';
                  checkSetup(preferred);
                }}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
              >
                Try Again
              </button>
              {onSkip && (
                <button
                  onClick={() => {
                    console.log('Wizard: Continue Anyway clicked');
                    onSkip();
                  }}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Continue Anyway
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default OllamaSetupWizard;
