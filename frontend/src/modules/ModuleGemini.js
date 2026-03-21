import BaseModule from './BaseModule';

/**
 * Module Gemini: Online AI Brain
 * Uses Google Gemini API for dynamic responses with live search capabilities.
 * 
 * ✅ REQUIRES NETWORK - Uses Google Cloud APIs
 * Requires a valid Gemini API Key
 */
class ModuleGemini extends BaseModule {
  constructor() {
    super({
      id: 'gemini',
      name: 'Online AI Brain',
      version: '1.0.0',
      requiresNetwork: true // Requires internet
    });
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
    this.modelName = 'gemini-2.5-flash'; // Optimized for speed and search
    this.chatHistory = [];
    this.MAX_HISTORY = 10;
    this.systemContext = null;
  }

  async initialize() {
    this.apiKey = localStorage.getItem('gemini_api_key');
    
    if (!this.apiKey) {
      return { 
        success: false, 
        error: 'Gemini API Key is missing. Please enter it in Settings.',
        code: 'REQUIRES_SETUP'
      };
    }

    // Basic connectivity check (optional but recommended)
    try {
      if (!navigator.onLine) {
        return { success: false, error: 'Internet connection required for Online Mode.' };
      }
      
      this.isInitialized = true;
      this.isActive = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to initialize Online AI: ' + error.message };
    }
  }

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('gemini_api_key', key);
  }

  setSystemContext(context) {
    this.systemContext = context;
  }

  async processQuestion(question) {
    if (!this.isInitialized || !this.isActive) {
      const initResult = await this.initialize();
      if (!initResult.success) throw new Error(initResult.error);
    }

    try {
      const response = await this.callGeminiAPI(question);

      return {
        success: true,
        answer: response,
        question: question,
        source: 'gemini-online',
        history: this.chatHistory
      };
    } catch (error) {
      console.error('Gemini Online error:', error);
      return {
        success: false,
        error: 'Failed to get response from Online AI: ' + error.message,
        retryable: true
      };
    }
  }

  async callGeminiAPI(question) {
    const userContext = localStorage.getItem('ai_system_instructions') || "You are a helpful, professional AI assistant. Keep responses concise.";
    
    // Prepare conversation messages
    let prompt = `System Instructions: ${userContext}\n`;
    if (this.systemContext) {
      prompt += `\nFoundation Knowledge:\n${this.systemContext}\n\nStrictly answer based on this knowledge if relevant.`;
    }
    
    // Simple implementation using Fetch API to avoid heavy dependencies on old hardware
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    
    const contents = [];
    
    // Add history (limited)
    this.chatHistory.forEach(msg => {
      contents.push({ role: msg.role, parts: [{ text: msg.content }] });
    });
    
    // Add current question
    contents.push({ role: 'user', parts: [{ text: `${prompt}\n\nUser Question: ${question}` }] });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        tools: [
          { google_search: {} }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Gemini API Error');
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Update history
    this.chatHistory.push({ role: 'user', content: question });
    this.chatHistory.push({ role: 'model', content: aiResponse });
    
    if (this.chatHistory.length > this.MAX_HISTORY * 2) {
      this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY * 2);
    }

    return aiResponse;
  }

  async testConnection() {
    if (!this.apiKey) return { success: false, error: 'No API Key' };
    try {
      const result = await this.callGeminiAPI('Ping');
      return { success: true, message: 'Online Connection Successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    this.isActive = false;
    this.isInitialized = false;
    await super.cleanup();
  }
}

export default ModuleGemini;
