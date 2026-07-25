import React, { useState, useEffect, useRef } from 'react';
import { FaRobot, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaCog, FaDownload } from 'react-icons/fa';

/**
 * Ollama Setup Wizard
 * Auto-configures Ollama CORS for first-time users
 */
const OllamaSetupWizard = ({ onComplete, onSkip, targetModel: defaultTarget }) => {
  const [step, setStep] = useState('checking'); // checking, needs-setup, installing, configuring, model-selection, pulling-model, success, error
  const [setupStatus, setSetupStatus] = useState(null);
  const [configSteps, setConfigSteps] = useState([]);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [installLogs, setInstallLogs] = useState([]);
  const [installPhase, setInstallPhase] = useState('preparing'); // preparing, downloading, running, verifying, starting
  const logEndRef = useRef(null);
  const installLogsRef = useRef(null);
  const stepRef = useRef(step);

  // Auto-scroll install logs
  useEffect(() => {
    if (installLogsRef.current) {
      installLogsRef.current.scrollTop = installLogsRef.current.scrollHeight;
    }
  }, [installLogs]);

  useEffect(() => {
    // Progress listener for both install and model pull
    const cleanup = window.electronAPI.onOllamaLog((msg) => {
      // During install step, capture all log messages
      if (stepRef.current === 'installing') {
        // Clean up the message for display
        let displayMsg = msg.replace(/\[OllamaSetup\]\s*/g, '').replace(/\[OllamaSetup:?\w*\]\s*/g, '').trim();
        if (displayMsg) {
          setInstallLogs(prev => [...prev.slice(-20), displayMsg]); // Keep last 20 messages
        }

        // Detect install phases from log messages
        if (msg.includes('Downloading') || msg.includes('download')) setInstallPhase('downloading');
        else if (msg.includes('Requesting elevation') || msg.includes('Installer staged') || msg.includes('Activating')) setInstallPhase('running');
        else if (msg.includes('Verifying installation')) setInstallPhase('verifying');
        else if (msg.includes('Starting headless') || msg.includes('Headless service') || msg.includes('Waiting for AI')) setInstallPhase('starting');
        else if (msg.includes('Suppressing')) setInstallPhase('starting');
      }

      // Parse percentage for model pull: "pulling 7462734796d6:  27%"
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

  // Keep the ref in sync with state so the log listener closure reads the latest step
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  
  const handleInstall = async () => {
    console.log('Wizard: handleInstall clicked');
    try {
      setStep('installing');
      setInstallLogs([]);
      setInstallPhase('preparing');
      setError(null);
      
      const result = await window.electronAPI.ollamaInstall();
      console.log('Wizard: Install request result:', result);
      
      if (result.success) {
        // Refresh setup status and move to next logical step
        const target = defaultTarget || localStorage.getItem('ai_model') || 'gemma3:1b';
        await checkSetup(target);
      } else {
        setError(result.error);
        setStep('error');
      }
    } catch (err) {
      console.error('Wizard: Install error:', err);
      setError(err.message);
      setStep('error');
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

  // Install phase display info
  const getInstallPhaseInfo = () => {
    const phases = {
      preparing: { label: 'Preparing Installation', icon: '📦', progress: 10 },
      downloading: { label: 'Locating Installer', icon: '📥', progress: 25 },
      running: { label: 'Installing AI Core', icon: '⚙️', progress: 50 },
      verifying: { label: 'Verifying Installation', icon: '🔍', progress: 75 },
      starting: { label: 'Starting AI Service', icon: '🚀', progress: 90 },
    };
    return phases[installPhase] || phases.preparing;
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
            {/* LM Studio detected but API not active — show targeted guidance first */}
            {setupStatus?.lmStudioRunning && !setupStatus?.apiAvailable ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-5">
                <div className="flex items-start">
                  <FaExclamationTriangle className="text-blue-500 text-xl mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1">LM Studio Detected — Local Server Not Active</h3>
                    <p className="text-blue-800 text-sm mb-3">
                      LM Studio is open but its Local Server is not running. Enable it to use LM Studio as the AI engine.
                    </p>
                    <ol className="text-sm text-blue-800 space-y-1 list-decimal pl-4">
                      <li>In LM Studio, open the <strong>Local Server</strong> tab (left sidebar)</li>
                      <li>Load a model (e.g. Gemma 3)</li>
                      <li>Click <strong>Start Server</strong></li>
                      <li>Return here and click <strong>Check Again</strong></li>
                    </ol>
                  </div>
                </div>
              </div>
            ) : (
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
            )}

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
              {setupStatus?.lmStudioRunning && !setupStatus?.apiAvailable ? (
                <button
                  onClick={() => checkSetup()}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  <FaSpinner className={step === 'checking' ? 'animate-spin' : ''} />
                  Check Again
                </button>
              ) : !setupStatus?.ollamaInstalled ? (
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  <FaDownload />
                  Setup AI Core
                </button>
              ) : (
                <button
                  onClick={handleConfigure}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  <FaCog className={step === 'configuring' ? 'animate-spin' : ''} />
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

            {/* LM Studio alternative hint for non-LM-Studio users */}
            {!setupStatus?.lmStudioRunning && (
              <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-600 mb-1">Already have LM Studio?</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Open LM Studio → <strong>Local Server</strong> tab → load a model → click <strong>Start Server</strong>.
                  Then return here and the AI features will connect automatically.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-4 text-center">
              {!setupStatus?.ollamaInstalled && !setupStatus?.lmStudioRunning
                ? 'A Windows security prompt will appear — click Yes to allow the installation.'
                : setupStatus?.lmStudioRunning
                ? "Start LM Studio's Local Server, then click Check Again above."
                : 'This will set an environment variable and restart Ollama. No admin privileges required.'}
            </p>
          </div>
        )}

        {/* Installing — dedicated progress view */}
        {step === 'installing' && (
          <div className="py-4">
            {/* Phase indicator */}
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">{getInstallPhaseInfo().icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {getInstallPhaseInfo().label}
              </h3>
              <p className="text-gray-500 text-sm">
                Please don't close the app. This may take a minute.
              </p>
            </div>

            {/* Animated progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-4 mb-4 overflow-hidden border border-gray-200">
              <div 
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${getInstallPhaseInfo().progress}%`,
                  background: 'linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #3b82f6 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite'
                }}
              />
            </div>

            {/* Step checklist */}
            <div className="space-y-3 mb-6">
              {[
                { id: 'preparing', label: 'Preparing installer' },
                { id: 'downloading', label: 'Locating AI Core package' },
                { id: 'running', label: 'Running installer (approve UAC prompt if shown)' },
                { id: 'verifying', label: 'Verifying installation' },
                { id: 'starting', label: 'Starting AI service' },
              ].map((phaseItem) => {
                const phaseOrder = ['preparing', 'downloading', 'running', 'verifying', 'starting'];
                const currentIdx = phaseOrder.indexOf(installPhase);
                const itemIdx = phaseOrder.indexOf(phaseItem.id);
                const isComplete = itemIdx < currentIdx;
                const isCurrent = itemIdx === currentIdx;

                return (
                  <div key={phaseItem.id} className="flex items-center gap-3 text-sm">
                    {isComplete ? (
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                    ) : isCurrent ? (
                      <FaSpinner className="text-blue-500 animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    )}
                    <span className={
                      isComplete ? 'text-green-700 line-through' :
                      isCurrent ? 'text-blue-700 font-semibold' :
                      'text-gray-400'
                    }>
                      {phaseItem.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Live log messages */}
            {installLogs.length > 0 && (
              <div 
                ref={installLogsRef}
                className="bg-gray-900 rounded-lg p-3 max-h-24 overflow-y-auto font-mono text-xs"
              >
                {installLogs.map((log, i) => (
                  <div key={i} className="text-gray-400 py-0.5">
                    <span className="text-gray-600 mr-2">›</span>
                    {log}
                  </div>
                ))}
              </div>
            )}

            {/* Inline CSS for shimmer animation */}
            <style>{`
              @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
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
