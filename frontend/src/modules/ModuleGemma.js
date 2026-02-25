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
      name: 'Offline AI Brain',
      version: '1.0.0',
      requiresNetwork: false // Works offline
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
          error: 'AI Engine is not ready. Setup required.',
          code: 'REQUIRES_SETUP',
          requiresOllama: true,
          suggestWizard: true, // Trigger setup wizard UI
          setupInstructions: this.getSetupInstructions()
        };
      }

      // Check availablity of models (Prioritize Fast 2B over 9B)
      const availableModel = await this.checkModelAvailable();
      
      if (!availableModel) {
        return {
          success: false,
          error: 'Intelligence model not found. System setup required.',
          code: 'REQUIRES_SETUP',
          requiresModel: true,
          suggestWizard: true, // Trigger setup wizard UI
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
    if (window.electronAPI && window.electronAPI.ollamaCheckSetup) {
      try {
        const preferredModel = localStorage.getItem('ai_model') || 'gemma2:2b';
        const result = await window.electronAPI.ollamaCheckSetup(preferredModel);
        console.log('[GemmaModule] IPC Ollama Check Result:', result);
        // We consider it available if it's running and API is responding
        return result.success && result.configured;
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
    // 1. Try using the new Electron API first (Recommended)
    if (window.electronAPI && window.electronAPI.ollamaVerify) {
      try {
        console.log('[GemmaModule] Using IPC for model verification...');
        const verifyResult = await window.electronAPI.ollamaVerify();
        if (verifyResult.success && verifyResult.models && verifyResult.models.length > 0) {
            const models = verifyResult.models;
            console.log('[GemmaModule] IPC Available Ollama Models:', models);
            
            // Check for Admin Preferred Model
            const preferredModel = localStorage.getItem('ai_model');
            if (preferredModel) {
                const match = models.find(m => m.includes(preferredModel));
                if (match) return match;
            }

            // Fallback priorities
            if (models.some(m => m.includes('gemma2:2b'))) return models.find(m => m.includes('gemma2:2b'));
            if (models.some(m => m.includes('gemma2:9b'))) return models.find(m => m.includes('gemma2:9b'));
            if (models.some(m => m.includes('gemma2'))) return models.find(m => m.includes('gemma2'));
            
            return models[0]; // Any model is better than none
        }
      } catch (e) {
        console.warn('Electron Model verification failed:', e);
      }
    }

    // 2. Fallback to fetch (Might fail in some environments)
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      const data = await response.json();
      const models = data.models || [];
      console.log('[GemmaModule] Fetch Available Ollama Models:', models.map(m => m.name));
      
      const modelNames = models.map(m => m.name);
      
      const preferredModel = localStorage.getItem('ai_model');
      if (preferredModel) {
          const match = modelNames.find(name => name.includes(preferredModel));
          if (match) return match;
      }

      const fastModel = modelNames.find(name => name.includes('gemma2:2b'));
      if (fastModel) return fastModel;

      const smartModel = modelNames.find(name => name.includes('gemma2:9b'));
      if (smartModel) return smartModel;

      const anyGemma = modelNames.find(name => name.includes('gemma2'));
      if (anyGemma) return anyGemma;

      return null;
    } catch (error) {
      return null;
    }
  }

  getSetupInstructions() {
    return {
      step1: 'Initialize AI Core',
      step2: 'Wait for model processing',
      step3: 'Downloading intelligence data...',
      step4: 'Finalizing configuration',
      step5: 'Restart the application to apply changes.'
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
      console.error('AI Brain error:', error);
      return {
        success: false,
        error: 'Failed to get response from AI Brain',
        retryable: true
      };
    }
  }

  setSystemContext(context) {
    this.systemContext = context;
  }

  async processWithOllama(question) {
    const noEmoji = "Do not use emojis in your response. Keep the tone professional.";
    const userContext = localStorage.getItem('ai_system_instructions') || "";
    let prompt = `Instructions: ${noEmoji}\n`;
    if (userContext) prompt += `System Instructions: ${userContext}\n`;
    prompt += `\nQuestion: ${question}`;
    
    // Inject Foundation Frame (Knowledge Base) if exists
    if (this.systemContext) {
      prompt = `Using the following reference material as your strict boundary and foundation:\n\n` + 
               `--- BEGIN REFERENCE ---\n${this.systemContext}\n--- END REFERENCE ---\n\n` +
               `Instructions: Answer the user's question based primarily on the reference material above. ` +
               `If the answer is not in the reference, you may use your general knowledge but mention that it's outside the provided context.\n` +
               `IMPORTANT: ${noEmoji}\n`;

      if (userContext) prompt += `System Instructions: ${userContext}\n`;
      
      prompt += `\nQuestion: ${question}`;
    }

    // DYNAMIC CHECK: Update model preference if changed in settings/localStorage
    const preferredModel = localStorage.getItem('ai_model');
    if (preferredModel && this.modelName !== preferredModel) {
        console.log(`🔄 [GemmaModule] Switching model from ${this.modelName} to preferred ${preferredModel}`);
        this.modelName = preferredModel;
    }

    console.log('[GemmaModule] Generating response using model: ', this.modelName);

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

