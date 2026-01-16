import BaseModule from './BaseModule';

/**
 * Module 2: Gemma 2 9B AI
 * Uses Ollama with Gemma 2 9B model for AI responses
 * 
 * ✅ WORKS OFFLINE - Uses local Ollama installation
 * Requires Ollama to be installed and Gemma 2 9B model downloaded
 */
class ModuleGemma extends BaseModule {
  constructor() {
    super({
      id: 'gemma',
      name: 'Gemma 2 9B AI Brain',
      version: '1.0.0',
      requiresNetwork: false // Works offline with Ollama
    });
    this.ollamaUrl = 'http://localhost:11434';
    this.modelName = 'gemma2:9b';
    this.isOllamaAvailable = false;
  }

  async initialize() {
    try {
      // Check if Ollama is available
      const isAvailable = await this.checkOllamaAvailable();
      
      if (!isAvailable) {
        return { 
          success: false, 
          error: 'Ollama is not running. Setup required.',
          code: 'REQUIRES_SETUP',
          requiresOllama: true,
          setupInstructions: this.getSetupInstructions()
        };
      }

      // Check availablity of models (Prioritize Fast 2B over 9B)
      const availableModel = await this.checkModelAvailable();
      
      if (!availableModel) {
        return {
          success: false,
          error: 'Gemma 2 model not found. Please install gemma2:2b (Fast) or gemma2:9b.',
          code: 'REQUIRES_SETUP',
          requiresModel: true,
          setupInstructions: this.getSetupInstructions()
        };
      }
      
      this.modelName = availableModel; // Set the found model (e.g., 'gemma2:2b')
      
      this.isOllamaAvailable = true;
      this.isInitialized = true;
      this.isActive = true;
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize Gemma module:', error);
      return { success: false, error: error.message };
    }
  }

  async checkOllamaAvailable() {
    // If running in Electron with the new API
    if (window.electronAPI && window.electronAPI.ollamaCheck) {
      try {
        const result = await window.electronAPI.ollamaCheck();
        return result.installed;
      } catch (e) {
        console.warn('Electron Ollama check failed:', e);
      }
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async checkModelAvailable() {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      const data = await response.json();
      const models = data.models || [];
      console.log('🤖 [GemmaModule] Available Ollama Models:', models.map(m => m.name));
      
      // 1. Check for Admin Preferred Model
      const preferredModel = localStorage.getItem('ai_model');
      console.log(`📋 [GemmaModule] Preferred Model from LocalStorage: "${preferredModel}"`);

      if (preferredModel) {
          const match = models.find(m => m.name.includes(preferredModel));
          if (match) {
              console.log(`✅ [GemmaModule] Found match for preferred: ${match.name}`);
              return match.name;
          } else {
              console.warn(`❌ [GemmaModule] Preferred model "${preferredModel}" NOT found in Ollama!`);
          }
      }

      // 2. Fallback: Prioritize Gemma 2 2B (Faster)
      const fastModel = models.find(m => m.name.includes('gemma2:2b'));
      if (fastModel) return fastModel.name;

      // 3. Fallback: Gemma 2 9B (Smarter but Slower)
      const smartModel = models.find(m => m.name.includes('gemma2:9b'));
      if (smartModel) return smartModel.name;

      // 4. Fallback: Any gemma2
      const anyGemma = models.find(m => m.name.includes('gemma2'));
      if (anyGemma) return anyGemma.name;

      return null;
    } catch (error) {
      return null;
    }
  }

  getSetupInstructions() {
    return {
      step1: 'Install Ollama from https://ollama.com',
      step2: 'Open terminal/command prompt',
      step3: 'Run: ollama pull gemma2:2b',
      step4: 'Wait for download to complete (~1.5GB)',
      step5: 'Restart this application. (gemma2:2b is 5x faster than 9b)'
    };
  }

  async processQuestion(question) {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    if (!this.isOllamaAvailable) {
      throw new Error('Ollama is not available. Please ensure Ollama is installed and running.');
    }

    try {
      const response = await this.processWithOllama(question);

      return {
        success: true,
        answer: response,
        question: question,
        source: 'gemma2'
      };
    } catch (error) {
      console.error('Gemma/Ollama error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get response from Gemma',
        retryable: true
      };
    }
  }

  setSystemContext(context) {
    this.systemContext = context;
  }

  async processWithOllama(question) {
    const noEmoji = "Do not use emojis in your response. Keep the tone professional.";
    let prompt = `Instructions: ${noEmoji}\n\nQuestion: ${question}`;
    
    // Inject Foundation Frame (Knowledge Base) if exists
    if (this.systemContext) {
      prompt = `Using the following reference material as your strict boundary and foundation:\n\n` + 
               `--- BEGIN REFERENCE ---\n${this.systemContext}\n--- END REFERENCE ---\n\n` +
               `Instructions: Answer the user's question based primarily on the reference material above. ` +
               `If the answer is not in the reference, you may use your general knowledge but mention that it's outside the provided context.\n` +
               `IMPORTANT: ${noEmoji}\n\n` +
               `Question: ${question}`;
    }

    // DYNAMIC CHECK: Update model preference if changed in settings/localStorage
    const preferredModel = localStorage.getItem('ai_model');
    if (preferredModel && this.modelName !== preferredModel) {
        console.log(`🔄 [GemmaModule] Switching model from ${this.modelName} to preferred ${preferredModel}`);
        this.modelName = preferredModel;
    }

    console.log(`🧠 [GemmaModule] Generating response using model: ${this.modelName}`);

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    const data = await response.json();
    return data.response || 'No response generated';
  }

  async testConnection() {
    try {
      const isAvailable = await this.checkOllamaAvailable();
      if (!isAvailable) {
        return { success: false, error: 'Ollama is not running' };
      }

      const modelAvailable = await this.checkModelAvailable();
      if (!modelAvailable) {
        return { success: false, error: 'Gemma 2 9B model not found' };
      }

      // Test with a simple question
      const testResponse = await this.processWithOllama('Hello');
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    this.isOllamaAvailable = false;
    await super.cleanup();
  }
}

export default ModuleGemma;

