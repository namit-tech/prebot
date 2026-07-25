import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';
import PredefinedInterface from '../modules/PredefinedInterface';
import AIBrainInterface from '../modules/AIBrainInterface';
import AIStatusPanel from '../modules/GeminiConfig'; // Renamed UI component
import PredefinedAdmin from '../modules/PredefinedAdmin';
import SetupWizard from '../common/SetupWizard';
import OllamaSetupWizard from '../setup/OllamaSetupWizard';
import WhisperSetupWizard from '../setup/WhisperSetupWizard';
import { FaClipboardList, FaBrain, FaRobot, FaInfoCircle, FaExclamationCircle } from 'react-icons/fa';

const ModuleSelector = () => {
  const { availableModules, activeModule, loadModule, loading, error, clearError } = useModule();
  const [selectedTab, setSelectedTab] = useState(activeModule || null);
  const [showConfig, setShowConfig] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [showWhisperSetup, setShowWhisperSetup] = useState(false);
  const [infoModal, setInfoModal] = useState(null); // 'predefined' or 'gemma'
  const [setupModel, setSetupModel] = useState('gemma3:1b'); // Force gemma3:1b as primary target for all clean installs

  // Sync selectedTab with activeModule when it changes successfully
  useEffect(() => {
    setSelectedTab(activeModule);
  }, [activeModule]);

  // Handle initial activeModule if availableModules data arrives later
  useEffect(() => {
    if (activeModule && !selectedTab) {
      setSelectedTab(activeModule);
    }
  }, [availableModules, activeModule]);

  useEffect(() => {
    // Check Whisper model on component mount
    if (window.electronAPI && window.electronAPI.whisperCheckSetup) {
      window.electronAPI.whisperCheckSetup().then(setup => {
        if (!setup.exists || !setup.isComplete) {
          setShowWhisperSetup(true);
        }
      });
    }

    // Check if we should automatically trigger the Ollama setup modal
    const trigger = localStorage.getItem('trigger_ollama_setup');
    if (trigger === 'true') {
      localStorage.removeItem('trigger_ollama_setup');
      setShowOllamaSetup(true);
    }
  }, []);

  const handleModuleSelect = async (moduleId) => {
    setSelectedTab(moduleId);
    const result = await loadModule(moduleId);
    if (!result.success) {
      if (result.code === 'REQUIRES_SETUP' && result.suggestWizard) {
        // Use the new automated AI setup wizard
        setShowOllamaSetup(true);
      } else if (result.code === 'REQUIRES_SETUP') {
        // For Gemini, we don't show the offline wizard, we show the config
        if (moduleId === 'gemini') {
          setShowConfig(true);
        } else {
          // Old setup wizard (legacy manual setup)
          const preferred = localStorage.getItem('ai_model') || 'gemma3:1b';
          setSetupModel(preferred);
          setShowSetup(true);
        }
      } else {
        alert(result.error || 'Failed to load module');
      }
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setShowOllamaSetup(false);
    
    // Explicitly clear any persistent errors (like "Ollama not running")
    if (clearError) clearError();

    // Reload the active module (should be the one that triggered setup)
    if (activeModule) {
      loadModule(activeModule);
    } else {
      // Try loading gemma since that's likely what was being set up
      loadModule('gemma');
    }
  };

  const moduleIcons = {
    predefined: <FaClipboardList />,
    gemma: <FaBrain />,
    gemini: <FaRobot />
  };

  return (
    <div className="space-y-6">
      <div className="card">
        {/* Header - Only show if no active module or single module setup needed */}
        {!activeModule && <h2 className="text-xl font-bold text-gray-900 mb-4">Select AI Module</h2>}
        
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading modules...</p>
          </div>
        ) : availableModules.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">No modules available in your subscription.</p>
            <p className="text-xs text-gray-400 mt-2">
              Detected licenses: {availableModules.map(m => m.id).join(', ') || 'None'}
            </p>
          </div>
        ) : (
          <div>
            {availableModules.length > 1 && (
              <div className="flex p-1 bg-gray-100 rounded-xl mb-6 border border-gray-200">
                {availableModules.map((module) => (
                   <div key={module.id} className="flex-1 relative group">
                     <button
                       onClick={() => handleModuleSelect(module.id)}
                       className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                         selectedTab === module.id
                           ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                           : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                       }`}
                     >
                       <span className="text-xl">{moduleIcons[module.id] || <FaRobot />}</span>
                       <div className="flex flex-col items-start leading-tight">
                           <span>{module.name}</span>
                           {activeModule === module.id && (
                               <span className="text-[9px] uppercase tracking-tighter text-blue-400 font-bold">Active Module</span>
                           )}
                       </div>
                     </button>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         setInfoModal(module.id === 'predefined' ? 'predefined' : 'gemma');
                       }}
                       className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 p-1.5 rounded-full transition-colors z-10"
                       title="Learn more about this module"
                     >
                       <FaInfoCircle className="text-base" />
                     </button>
                   </div>
                ))}
              </div>
            )}

            {/* Single Model View (or empty state if none selected) */}
            {availableModules.length === 1 && !activeModule && (
              <div
                onClick={() => handleModuleSelect(availableModules[0].id)}
                className="p-6 border-2 border-primary-500 bg-primary-50 rounded-lg cursor-pointer flex items-center gap-4"
              >
                <div className="text-4xl text-primary-600">
                  {moduleIcons[availableModules[0].id] || <FaRobot />}
                </div>
                <div>
                   <h3 className="text-lg font-semibold text-gray-900">
                     {availableModules[0].name}
                   </h3>
                   <p className="text-sm text-gray-600">Click to activate</p>
                </div>
              </div>
            )}
            
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-4">
               <div className="bg-red-100 p-2 rounded-full text-red-600">
                  <FaExclamationCircle />
               </div>
               <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-900">Module Initialization Failed</h3>
                  <p className="text-xs text-red-700 mt-1 leading-relaxed">
                    {error}. {error.includes('Setup required') && 'The required AI engine components are missing on this machine.'}
                  </p>
                  {error.includes('Setup required') && (
                     <button 
                       onClick={() => setShowOllamaSetup(true)}
                       className="mt-3 bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-red-700 transition-all uppercase tracking-wider"
                     >
                       Begin Automated Installation
                     </button>
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      {activeModule && (
        <>
          <div className="flex gap-2 mb-4">
            {(activeModule === 'gemma' || activeModule === 'gemini') && (
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="btn-secondary"
              >
                {showConfig ? 'Hide' : 'Show'} Status
              </button>
            )}
            {activeModule === 'predefined' && (
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className="btn-secondary"
              >
                {showAdmin ? 'Hide' : 'Manage'} Questions
              </button>
            )}
          </div>

          {showConfig && (selectedTab === 'gemma' || selectedTab === 'gemini') && (
            <div className="mb-6">
              <AIStatusPanel 
                onRequestSetup={() => setShowOllamaSetup(true)} 
                activeTabId={selectedTab}
              />
            </div>
          )}
          {showAdmin && selectedTab === 'predefined' && <PredefinedAdmin />}

          {selectedTab === 'predefined' ? (
            <PredefinedInterface />
          ) : (
            <AIBrainInterface activeTabId={selectedTab} />
          )}
        </>
      )}
      
      {/* Setup Wizard Modal (Legacy) */}
      <SetupWizard 
        isOpen={showSetup} 
        onClose={() => setShowSetup(false)}
        onComplete={handleSetupComplete}
        targetModel={setupModel}
      />
      
      {/* AI Setup Wizard (Automated) */}
      {showOllamaSetup && (
        <OllamaSetupWizard
          targetModel="gemma3:1b"
          onComplete={handleSetupComplete}
          onSkip={() => setShowOllamaSetup(false)}
        />
      )}

      {/* Whisper Accuracy Wizard (Automated) */}
      {showWhisperSetup && (
        <WhisperSetupWizard
          onComplete={() => setShowWhisperSetup(false)}
          onSkip={() => setShowWhisperSetup(false)}
        />
      )}

      {/* Module Info Modal */}
      {infoModal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-blue-500"><FaInfoCircle /></span>
              {infoModal === 'predefined' ? 'Predefined Q&A Mode' : 'AI Brain Mode'}
            </h3>
            <div className="text-gray-600 text-sm leading-relaxed space-y-3">
              {infoModal === 'predefined' ? (
                <>
                  <p>In this mode, there is <strong>no AI brain involved</strong>. This is designed for lightning-fast, static replies.</p>
                  <p>You manually add the Questions and corresponding Answers in the "Manage Questions" section. When a user asks a matched question, the system will instantly deliver your exact predefined response along with the video you've set.</p>
                </>
              ) : (
                <>
                  <p>The AI Brain mode provides dynamic responses powered by standard or premium models.</p>
                  <p>It operates in three distinct ways:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li><strong>Predefined Question, AI Answer:</strong> Lock in exactly what questions can be asked, but let the AI generate a conversational, dynamic response.</li>
                    <li><strong>Hands-Free / Wake Word:</strong> Set a custom wake word. When spoken, the AI assistant automatically starts listening, processes your question, and responds dynamically with the video avatar.</li>
                    <li><strong>Hardware Mute Toggle:</strong> Use your physical microphone mute button as a trigger. Unmute to speak your question, then mute to instantly stop listening and trigger the AI's response.</li>
                  </ul>
                </>
              )}
            </div>
            <button
              onClick={() => setInfoModal(null)}
              className="mt-6 w-full btn-primary py-2 rounded-lg font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleSelector;
