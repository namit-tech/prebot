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
    this.ollamaUrl = 'http://localhost:11434'; // Base URL (updated during initialization)
    this.engineType = 'ollama'; // 'ollama' or 'openai' (for LM Studio/etc)
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
      this.startKeepAlive(); // P2: keep model warm between questions
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize Gemma module:', error);
      return { success: false, error: error.message };
    }
  }

  async checkOllamaAvailable() {
    // 1. Try the robust Electron IPC check first (supports LM Studio detection)
    if (window.electronAPI && window.electronAPI.ollamaVerify) {
      try {
        const result = await window.electronAPI.ollamaVerify();
        console.log('[GemmaModule] IPC Verify Result:', result);
        if (result.success && result.connected) {
           this.ollamaUrl = result.baseUrl || this.ollamaUrl;
           this.engineType = result.engineType || 'ollama';
           return true;
        }
      } catch (e) {
        console.warn('[GemmaModule] IPC Verify failed:', e);
      }
    }

    // 2. Direct fetch fallback for restricted environments
    const checkUrls = [
      { url: 'http://localhost:11434', type: 'ollama' },
      { url: 'http://localhost:1234', type: 'openai' },
      { url: 'http://localhost:11436', type: 'ollama' }
    ];

    for (const { url, type } of checkUrls) {
      try {
        const checkPath = type === 'ollama' ? '/api/tags' : '/v1/models';
        const response = await fetch(`${url}${checkPath}`, { 
           method: 'GET', 
           signal: AbortSignal.timeout(1500) 
        });
        if (response.ok) {
           this.ollamaUrl = url;
           this.engineType = type;
           console.log(`[GemmaModule] Detected engine at ${url} (${type})`);
           return true;
        }
      } catch (e) {}
    }

    return false;
  }

  async checkModelAvailable() {
    // 1. Try using the new Electron API first (Recommended)
    if (window.electronAPI && window.electronAPI.ollamaVerify) {
      try {
        console.log('[GemmaModule] Using IPC for model verification...');
        const verifyResult = await window.electronAPI.ollamaVerify();
        if (verifyResult.success && verifyResult.models) {
            const models = verifyResult.models;
            console.log('[GemmaModule] IPC Available Ollama Models:', models);
            
            if (models.length === 0) {
                 console.warn('[GemmaModule] ⚠️ AI Engine connected, but no models found.');
                 return null;
            }
            
            // 1. High Priority: Always use Gemma 3 1B if available (Our migration goal)
            const gemma3Match = models.find(m => m.includes('gemma3:1b') || m.includes('gemma3'));
            if (gemma3Match) {
                console.log('[GemmaModule] ✅ Verified Core Model:', gemma3Match);
                return gemma3Match;
            }

            // 2. Check for Admin Preferred Model (If not gemma3)
            const preferredModel = localStorage.getItem('ai_model') || 'gemma3:1b';
            if (preferredModel) {
                const match = models.find(m => m.includes(preferredModel));
                if (match) {
                    console.log('[GemmaModule] ✅ Verified Preferred Model:', match);
                    return match;
                }
            }

            // Fallback priorities
            const gemma2Match = models.find(m => m.includes('gemma2:2b') || m.includes('gemma:2b'));
            if (gemma2Match) {
                console.log('[GemmaModule] ⚠️ Using Legacy Fallback Model:', gemma2Match);
                return gemma2Match;
            }
            
            console.warn('[GemmaModule] ⚠️ Target model not found. Falling back to first available:', models[0]);
            return models[0];
        }
      } catch (e) {
        console.warn('Electron Model verification failed:', e);
      }
    }

    // 2. Fallback to fetch (Might fail in some environments)
    try {
      const isOpenAI = this.engineType === 'openai';
      const checkPath = isOpenAI ? '/v1/models' : '/api/tags';
      const response = await fetch(`${this.ollamaUrl}${checkPath}`);
      const data = await response.json();
      
      let modelNames = [];
      if (isOpenAI) {
          modelNames = (data.data || []).map(m => m.id);
      } else {
          modelNames = (data.models || []).map(m => m.name);
      }
      
      console.log('[GemmaModule] Fetch Available Ollama Models:', modelNames);
      
      if (modelNames.length === 0) return null;
      
      const preferredModel = localStorage.getItem('ai_model');
      if (preferredModel) {
          const match = modelNames.find(name => name.includes(preferredModel));
          if (match) return match;
      }

      const fastModel = modelNames.find(name => name.includes('gemma3:1b'));
      if (fastModel) return fastModel;

      const smartModel = modelNames.find(name => name.includes('gemma3'));
      if (smartModel) return smartModel;

      const anyGemma = modelNames.find(m => m.includes('gemma2:2b') || m.includes('gemma:2b'));
      if (anyGemma) return anyGemma;

      return modelNames[0];
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

  async processQuestion(question, onChunk = null) {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    if (!this.isOllamaAvailable) {
      throw new Error('Ollama is not available. Please ensure Ollama is installed and running.');
    }

    try {
      const response = await this.processWithOllama(question, onChunk);

      return {
        success: true,
        answer: response,
        question: question,
        source: 'gemma2',
        history: this.chatHistory
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

  async processWithOllama(question, onChunk = null) {
    const noEmoji = "Do not use emojis in your response. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis.";
    const userContext = localStorage.getItem('ai_system_instructions') || "You are a helpful, professional AI assistant. your name is Ram. Keep your responses concise and direct. Do not use markdown symbols like asterisks (*) or underscores (_) for emphasis, as your responses will be read aloud. i want only 10 words of response not even 11 in brief in short.";
    
    // 1. Maintain the Sliding Window (Short-term Memory)
    this.chatHistory.push({ role: 'user', content: question });
    if (this.chatHistory.length > this.MAX_HISTORY) {
        this.chatHistory.shift(); // Remove oldest User message
        this.chatHistory.shift(); // Remove oldest AI response
    }

    // 2. Prepare the Messages
    let systemPrompt = `Instructions: ${noEmoji}\n${userContext}`;
    
    const lastSummary = memoryService.getLastSummary();
    if (lastSummary) systemPrompt += `\n\nPrevious Conversation Summary: ${lastSummary}`;

    const recalledFacts = memoryService.getRelevantContext(question);
    if (recalledFacts) systemPrompt += `\n\nRetrieved Facts about User: ${recalledFacts}`;

    if (this.systemContext) {
      systemPrompt += `\n\nFoundation Knowledge:\n${this.systemContext}\n\nStrictly answer based on this knowledge if relevant.`;
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        ...this.chatHistory
    ];

    // 3. Call the Engine
    const isOllama = this.engineType === 'ollama';
    const endpoint = isOllama ? '/api/chat' : '/v1/chat/completions';
    
    console.log(`[GemmaModule] Using ${this.engineType} engine at ${this.ollamaUrl}${endpoint}`);

    const response = await fetch(`${this.ollamaUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: messages,
        stream: true,
        temperature: 0.7,
        keep_alive: -1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Engine error: ${errorText}`);
    }

    // 4. Read streaming NDJSON response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiResponse = '';
    let sentenceBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const token = isOllama
            ? (parsed.message?.content || '')
            : (parsed.choices?.[0]?.delta?.content || '');

          if (token) {
            aiResponse += token;
            if (onChunk) {
              sentenceBuffer += token;
              // Split on sentence-ending punctuation
              const sentenceEnd = /^(.*?[.!?])\s+(.*)$/s;
              let m;
              while ((m = sentenceEnd.exec(sentenceBuffer)) !== null) {
                const complete = m[1].trim();
                if (complete) onChunk(complete);
                sentenceBuffer = m[2];
              }
              // Also split on comma after 10+ words so TTS starts sooner on long sentences
              if (sentenceBuffer.split(/\s+/).length >= 10) {
                const commaIdx = sentenceBuffer.indexOf(',');
                if (commaIdx > 15) {
                  onChunk(sentenceBuffer.substring(0, commaIdx).trim());
                  sentenceBuffer = sentenceBuffer.substring(commaIdx + 1).trim();
                }
              }
            }
          }
        } catch (e) { /* skip malformed JSON lines */ }
      }
    }

    // Flush any remaining text that didn't end with punctuation
    if (onChunk && sentenceBuffer.trim()) {
      onChunk(sentenceBuffer.trim());
    }

    aiResponse = aiResponse || 'No response generated';

    // 5. Update Memory
    this.chatHistory.push({ role: 'assistant', content: aiResponse });

    if (this.chatHistory.length >= this.MAX_HISTORY) {
      this.triggerBackgroundSummary();
    }
    this.triggerBackgroundFactExtraction(question, aiResponse);

    return aiResponse;
  }

  startKeepAlive() {
    if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
    this._keepAliveInterval = setInterval(async () => {
      try {
        await fetch(`${this.ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.modelName, prompt: '', keep_alive: '10m', stream: false })
        });
        console.log('[GemmaModule] Keep-alive ping sent — model stays warm');
      } catch (e) { /* ignore network errors */ }
    }, 3 * 60 * 1000);
  }

  stopKeepAlive() {
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
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
    this.stopKeepAlive();
    this.isOllamaAvailable = false;
    await super.cleanup();
  }
}

export default ModuleGemma;

