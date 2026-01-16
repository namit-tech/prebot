import React, { useState } from 'react';
import { useModule } from '../../context/ModuleContext';
import PredefinedInterface from '../modules/PredefinedInterface';
import AIBrainInterface from '../modules/AIBrainInterface';
import GemmaConfig from '../modules/GeminiConfig'; // File renamed but export is GemmaConfig
import PredefinedAdmin from '../modules/PredefinedAdmin';
import SetupWizard from '../common/SetupWizard';
import { FaClipboardList, FaBrain, FaRobot } from 'react-icons/fa';

const ModuleSelector = () => {
  const { availableModules, activeModule, loadModule, loading, error } = useModule();
  const [showConfig, setShowConfig] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupModel, setSetupModel] = useState('gemma2:9b');

  const handleModuleSelect = async (moduleId) => {
    const result = await loadModule(moduleId);
    if (!result.success) {
      if (result.code === 'REQUIRES_SETUP') {
        setSetupModel('gemma2:9b'); // Default for now
        setShowSetup(true);
      } else {
        alert(result.error || 'Failed to load module');
      }
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
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
    gemini: <FaBrain /> // Backward compatibility
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
            {/* Multi-Model Switcher (Tabbed Interface) */}
            {availableModules.length > 1 && (
              <div className="flex p-1 bg-gray-100 rounded-xl mb-6 border border-gray-200">
                {availableModules.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => handleModuleSelect(module.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      activeModule === module.id
                        ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    <span className="text-xl">{moduleIcons[module.id] || <FaRobot />}</span>
                    {module.id === 'gemma' || module.id === 'gemini' ? 'Offline AI' : module.name}
                    {activeModule === module.id && (
                      <span className="ml-2 w-2 h-2 rounded-full bg-blue-500"></span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Single Model View (or empty state if none selected) */}
            {availableModules.length === 1 && !activeModule && (
              <div
                onClick={() => handleModuleSelect(availableModules[0].id)}
                className="p-6 border-2 border-primary-500 bg-primary-50 rounded-lg cursor-pointer flex items-center gap-4"
              >
                <div className="text-4xl text-primary-600">{moduleIcons[availableModules[0].id] || <FaRobot />}</div>
                <div>
                   <h3 className="text-lg font-semibold text-gray-900">
                     {availableModules[0].id === 'gemma' ? 'Offline AI' : availableModules[0].name}
                   </h3>
                   <p className="text-sm text-gray-600">Click to activate</p>
                </div>
              </div>
            )}
            
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
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

          {showConfig && (activeModule === 'gemma' || activeModule === 'gemini') && <GemmaConfig />}
          {showAdmin && activeModule === 'predefined' && <PredefinedAdmin />}

          {activeModule === 'predefined' ? (
            <PredefinedInterface />
          ) : (
            <AIBrainInterface />
          )}
        </>
      )}
      
      {/* Setup Wizard Modal */}
      <SetupWizard 
        isOpen={showSetup} 
        onClose={() => setShowSetup(false)}
        onComplete={handleSetupComplete}
        targetModel={setupModel}
      />
    </div>
  );
};

export default ModuleSelector;

