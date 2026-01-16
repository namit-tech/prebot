/**
 * Base Module Class
 * All modules must extend this class
 */
class BaseModule {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.version = config.version;
    this.requiresNetwork = config.requiresNetwork || false;
    this.isInitialized = false;
    this.isActive = false;
  }

  /**
   * Initialize the module
   * Must be implemented by child classes
   */
  async initialize() {
    throw new Error('initialize() must be implemented by child class');
  }

  /**
   * Process a question/request
   * Must be implemented by child classes
   */
  async processQuestion(question) {
    throw new Error('processQuestion() must be implemented by child class');
  }

  /**
   * Check if module is available
   */
  isAvailable() {
    return this.isInitialized && this.isActive;
  }

  /**
   * Cleanup when module is unloaded
   */
  async cleanup() {
    this.isActive = false;
    this.isInitialized = false;
  }

  /**
   * Get module configuration
   */
  getConfig() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      requiresNetwork: this.requiresNetwork,
      isInitialized: this.isInitialized,
      isActive: this.isActive
    };
  }
}

export default BaseModule;

