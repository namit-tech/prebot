import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import moduleManager from '../services/moduleManager.service';

const ModuleContext = createContext();

export const useModule = () => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModule must be used within ModuleProvider');
  }
  return context;
};

export const ModuleProvider = ({ children }) => {
  const { user } = useAuth();
  const [availableModules, setAvailableModules] = useState([]);
  const [activeModule, setActiveModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeModules = async () => {
      try {
        setLoading(true);
        const modules = await moduleManager.registerModules();
        setAvailableModules(moduleManager.getAvailableModules());
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    initializeModules();
  }, [user]);

  // Auto-select if only one module is available
  useEffect(() => {
    if (availableModules.length === 1 && !activeModule) {
      loadModule(availableModules[0].id);
    }
  }, [availableModules, activeModule]);

  const loadModule = async (moduleId) => {
    try {
      setError(null);
      const result = await moduleManager.loadModule(moduleId);
      
      if (result.success) {
        setActiveModule(moduleId);
        return { success: true };
      } else {
        setError(result.error);
        return result;
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const unloadModule = async () => {
    try {
      await moduleManager.unloadModule();
      setActiveModule(null);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const processQuestion = async (question) => {
    try {
      return await moduleManager.processQuestion(question);
    } catch (err) {
      throw err;
    }
  };

  const getModuleInstance = (moduleId) => {
    return moduleManager.getModuleInstance(moduleId);
  };

  return (
    <ModuleContext.Provider value={{
      availableModules,
      activeModule,
      loading,
      error,
      loadModule,
      unloadModule,
      processQuestion,
      getModuleInstance
    }}>
      {children}
    </ModuleContext.Provider>
  );
};

