import ModulePredefined from '../modules/ModulePredefined';
import ModuleGemma from '../modules/ModuleGemma';
import ModuleGemini from '../modules/ModuleGemini';
import authService from './auth.service';

/**
 * Module Manager
 * Handles loading, switching, and managing AI modules
 */
class ModuleManager {
  constructor() {
    this.modules = new Map();
    this.activeModule = null;
    this.availableModules = [];
  }

  /**
   * Register available modules
   */
  async registerModules() {
    // Check if we are in Special Edition mode
    let isSpecialEdition = false;
    if (window.electronAPI && window.electronAPI.isSpecialEdition) {
        isSpecialEdition = await window.electronAPI.isSpecialEdition();
        if (isSpecialEdition) console.log('[ModuleManager] 🛡️ Special Edition detected: Filtering AI Brains from UI');
    }

    // Get allowed modules from license
    const allowedModels = authService.getStoredModels();
    
    // Always register 'predefined' module
    if (!this.modules.has('predefined')) {
      this.modules.set('predefined', new ModulePredefined());
    }
    
    // Register Offline Brain (Gemma) & Online Brain (Gemini)
    // Only register these if NOT in Special Edition mode
    const hasAIAccess = (allowedModels.includes('gemma') || allowedModels.includes('gemini')) && !isSpecialEdition;

    if (hasAIAccess) {
      if (!this.modules.has('gemma')) {
        const module = new ModuleGemma();
        module.name = 'Offline AI Brain';
        this.modules.set('gemma', module);
      }
      if (!this.modules.has('gemini')) {
        const module = new ModuleGemini();
        module.name = 'Cloud AI Brain';
        this.modules.set('gemini', module);
      }
    }

    // Final list of available modules
    const finalModules = [];
    
    // Always include predefined if licensed
    if (allowedModels.includes('predefined')) {
      finalModules.push('predefined');
    }

    // Include both AI heads if there is any AI access (and not filtered by Special Edition)
    if (hasAIAccess) {
      finalModules.push('gemma');
      finalModules.push('gemini');
    }

    this.availableModules = Array.from(new Set(finalModules));
    return this.availableModules;
  }

  /**
   * Get available modules
   */
  getAvailableModules() {
    return this.availableModules.map(id => {
      const module = this.modules.get(id);
      return module ? module.getConfig() : null;
    }).filter(Boolean);
  }

  /**
   * Load a module
   */
  async loadModule(moduleId) {
    // Check if module is available
    if (!this.modules.has(moduleId)) {
      throw new Error(`Module ${moduleId} not available`);
    }

    // Check if user has access to this module
    const allowedModels = authService.getStoredModels();
    
    // Smart check for aliases (gemma/gemini)
    const isAllowed = allowedModels.includes(moduleId) || 
                     (moduleId === 'gemma' && allowedModels.includes('gemini')) ||
                     (moduleId === 'gemini' && allowedModels.includes('gemma'));

    if (!isAllowed) {
      throw new Error(`Module ${moduleId} not included in your subscription`);
    }

    // Unload current module if any
    if (this.activeModule) {
      await this.unloadModule(this.activeModule);
    }

    // Load new module
    const module = this.modules.get(moduleId);
    const result = await module.initialize();

    if (result.success) {
      this.activeModule = moduleId;
      return { success: true, module: module.getConfig() };
    } else {
      return result;
    }
  }

  /**
   * Unload current module
   */
  async unloadModule(moduleId = null) {
    const targetModuleId = moduleId || this.activeModule;
    
    if (!targetModuleId || !this.modules.has(targetModuleId)) {
      return { success: true };
    }

    const module = this.modules.get(targetModuleId);
    await module.cleanup();

    if (this.activeModule === targetModuleId) {
      this.activeModule = null;
    }

    return { success: true };
  }

  /**
   * Get active module
   */
  getActiveModule() {
    if (!this.activeModule) {
      return null;
    }

    const module = this.modules.get(this.activeModule);
    return module ? module.getConfig() : null;
  }

  /**
   * Process question with active module
   */
  async processQuestion(question) {
    if (!this.activeModule) {
      throw new Error('No active module');
    }

    const module = this.modules.get(this.activeModule);
    if (!module || !module.isAvailable()) {
      throw new Error('Active module not available');
    }

    return await module.processQuestion(question);
  }

  /**
   * Check if module is loaded
   */
  isModuleLoaded(moduleId) {
    return this.activeModule === moduleId;
  }

  /**
   * Get module instance
   */
  getModuleInstance(moduleId) {
    return this.modules.get(moduleId);
  }
}

// Singleton instance
const moduleManager = new ModuleManager();

export default moduleManager;

