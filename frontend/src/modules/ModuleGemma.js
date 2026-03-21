import BaseModule from './BaseModule';
import memoryService from '../services/memory.service';

/**
 * Module 2: Gemma 3 1B AI
 * Uses Ollama with Gemma 3 1B model for AI responses
 * 
 * ✅ WORKS OFFLINE - Uses local Ollama installation
 * Requires Ollama to be installed and Gemma 3 1B model downloaded
 */
class ModuleGemma extends BaseModule {
  constructor() {
    super({
      id: 'gemma',
      name: 'Offline AI Brain',
      version: '1.0.0',
      requiresNetwork: false // Works offline
    });
    this.ollamaUrl = 'http://localhost:11434'; // Use the bridge for consistent triggers
    this.modelName = 'gemma3:1b';
    this.isOllamaAvailable = false;
    this.chatHistory = []; // Short-term sliding window
    this.MAX_HISTORY = 12; // Industry standard window size
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

      // Check availablity of models (Prioritize Gemma 3 1B)
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
      
      this.modelName = availableModel; // Set the found model (e.g., 'gemma3:1b')
      
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
        const preferredModel = localStorage.getItem('ai_model') || 'gemma3:1b';
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
            
            // 1. High Priority: Always use Gemma 3 1B if available (Our migration goal)
            const gemma3Match = models.find(m => m.includes('gemma3:1b') || m.includes('gemma3'));
            if (gemma3Match) return gemma3Match;

            // 2. Check for Admin Preferred Model (If not gemma3)
            const preferredModel = localStorage.getItem('ai_model');
            if (preferredModel) {
                const match = models.find(m => m.includes(preferredModel));
                if (match) return match;
            }

            // Fallback priorities
            if (models.some(m => m.includes('gemma2:2b'))) return models.find(m => m.includes('gemma2:2b'));
            
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

      const fastModel = modelNames.find(name => name.includes('gemma3:1b'));
      if (fastModel) return fastModel;

      const smartModel = modelNames.find(name => name.includes('gemma3'));
      if (smartModel) return smartModel;

      const anyGemma = modelNames.find(name => name.includes('gemma2:2b'));
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
        source: 'gemma2',
        history: this.chatHistory // Return current history state
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
    const noEmoji = "Do not use emojis in your response. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis.";
    const userContext = localStorage.getItem('ai_system_instructions') || "You are a helpful, professional AI assistant. your name is Ram. Keep your responses concise and direct. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis, as your responses will be read aloud. i want only 10 words of response not even 11 in brief in short.";
    
    // 1. Maintain the Sliding Window (Short-term Memory)
    this.chatHistory.push({ role: 'user', content: question });
    if (this.chatHistory.length > this.MAX_HISTORY) {
        this.chatHistory.shift(); // Remove oldest User message
        this.chatHistory.shift(); // Remove oldest AI response
        console.log('[GemmaModule] Sliding window shifted to stay within token limits.');
    }

    // 2. Prepare the System Message (The "Foundation")
    let systemPrompt = `Instructions: ${noEmoji}\n${userContext}`;
    
    // Inject Last Summary if exists
    const lastSummary = memoryService.getLastSummary();
    if (lastSummary) {
        systemPrompt += `\n\nPrevious Conversation Summary: ${lastSummary}`;
    }

    // Inject Long-term Facts (Recall)
    const recalledFacts = memoryService.getRelevantContext(question);
    if (recalledFacts) {
        systemPrompt += `\n\nRetrieved Facts about User: ${recalledFacts}`;
    }

    if (this.systemContext) {
      systemPrompt += `\n\nFoundation Knowledge:\n${this.systemContext}\n\nStrictly answer based on this knowledge if relevant.`;
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        ...this.chatHistory
    ];

    console.log(`[GemmaModule] 🧠 SYSTEM PERSONA: "${userContext.substring(0, 50)}..."`);
    console.log('[GemmaModule] Generating response using /api/chat (Memory Enabled)');

    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: messages,
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
    const aiResponse = data.message.content || 'No response generated';
    
    // 3. Store AI response in Short-term Memory
    this.chatHistory.push({ role: 'assistant', content: aiResponse });
    
    // 4. SMART TRIGGER: Auto-Summarization & Fact Extraction
    // If history is long, ask the AI to summarize "behind the scenes"
    if (this.chatHistory.length >= this.MAX_HISTORY) {
        this.triggerBackgroundSummary();
    }
    
    // Always check for new "User Facts" to remember long-term
    this.triggerBackgroundFactExtraction(question, aiResponse);

    return aiResponse;
  }

  /**
   * Background Summarization
   * Keeps the conversation "Lean" and saves RAM
   */
  async triggerBackgroundSummary() {
      // ... (existing logic) ...
  }

  /**
   * Background Fact Extraction
   * Detects names, locations, and preferences to remember "Forever" (Offline)
   */
  async triggerBackgroundFactExtraction(userQ, aiA) {
      try {
          const factPrompt = `Review this exchange and output ONLY a single short fact to remember about the user if any (e.g. "User lives in London"). If no new fact is present, output "NONE".\n\nUser: ${userQ}\nAI: ${aiA}`;
          
          const response = await fetch(`${this.ollamaUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  model: this.modelName,
                  messages: [{ role: 'user', content: factPrompt }],
                  stream: false,
                  options: { temperature: 0 } // Keep it deterministic
              })
          });

          if (response.ok) {
              const data = await response.json();
              const fact = data.message.content.trim();
              if (fact && fact !== 'NONE' && !fact.includes('no new fact')) {
                  memoryService.storeFact(fact);
              }
          }
      } catch (e) {
          console.warn('Fact extraction failed:', e);
      }
  }

  async testConnection() {
    try {
      const isAvailable = await this.checkOllamaAvailable();
      if (!isAvailable) {
        return { success: false, error: 'Ollama is not running' };
      }

      const modelAvailable = await this.checkModelAvailable();
      if (!modelAvailable) {
        return { success: false, error: 'Gemma 3 1B model not found' };
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

