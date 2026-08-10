import BaseModule from './BaseModule';

/**
 * Module OpenAI: Cloud AI Brain (ChatGPT)
 * Uses OpenAI Chat Completions API with streaming capabilities.
 *
 * ✅ REQUIRES NETWORK - Uses OpenAI APIs
 * Requires a valid OpenAI API Key
 */
class ModuleOpenAI extends BaseModule {
  constructor() {
    super({
      id: 'openai',
      name: 'OpenAI (ChatGPT) Brain',
      version: '1.0.0',
      requiresNetwork: true
    });
    this.apiKey = localStorage.getItem('openai_api_key') || '';
    this.modelName = localStorage.getItem('openai_model') || 'gpt-4o-mini';
    this.chatHistory = [];
    this.MAX_HISTORY = 10;
    this.systemContext = null;
  }

  async initialize() {
    this.apiKey = localStorage.getItem('openai_api_key') || '';
    this.modelName = localStorage.getItem('openai_model') || 'gpt-4o-mini';

    if (!this.apiKey) {
      return {
        success: false,
        error: 'OpenAI API Key is missing. Please enter it in Cloud AI Settings.',
        code: 'REQUIRES_SETUP'
      };
    }

    try {
      if (!navigator.onLine) {
        return { success: false, error: 'Internet connection required for Online Mode.' };
      }

      this.isInitialized = true;
      this.isActive = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to initialize OpenAI AI: ' + error.message };
    }
  }

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('openai_api_key', key);
  }

  setModel(model) {
    this.modelName = model;
    localStorage.setItem('openai_model', model);
  }

  setSystemContext(context) {
    this.systemContext = context;
  }

  async processQuestion(question, onChunk = null) {
    if (!this.isInitialized || !this.isActive) {
      const initResult = await this.initialize();
      if (!initResult.success) throw new Error(initResult.error);
    }

    try {
      const response = await this.callOpenAIAPI(question, onChunk);

      return {
        success: true,
        answer: response,
        question: question,
        source: 'openai-cloud',
        history: this.chatHistory
      };
    } catch (error) {
      console.error('OpenAI Cloud error:', error);
      return {
        success: false,
        error: 'Failed to get response from OpenAI: ' + error.message,
        retryable: true
      };
    }
  }

  async callOpenAIAPI(question, onChunk = null, _retries = 2) {
    const userContext = localStorage.getItem('ai_system_instructions') || "You are a helpful, professional AI assistant. Keep responses concise.";

    const ttsVoiceName = (JSON.parse(localStorage.getItem('voice_settings') || '{}').voice || '').toLowerCase();
    const ttsLang = ttsVoiceName.includes('hindi') || ttsVoiceName.includes('hemant') || ttsVoiceName.includes('kalpana') ? 'Hindi'
                  : ttsVoiceName.includes('tamil') ? 'Tamil'
                  : ttsVoiceName.includes('telugu') ? 'Telugu'
                  : ttsVoiceName.includes('bengali') ? 'Bengali'
                  : 'English';

    const systemText = `${userContext}\n\nLANGUAGE RULE: Always respond in ${ttsLang}. Keep answers concise.`;

    let userPrompt = '';
    if (this.systemContext) {
      userPrompt += `Foundation Knowledge:\n${this.systemContext}\n\nStrictly answer based on this knowledge if relevant.\n\n`;
    }
    userPrompt += `User Question: ${question}`;

    const messages = [
      { role: 'system', content: systemText }
    ];

    this.chatHistory.forEach(msg => {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    });

    messages.push({ role: 'user', content: userPrompt });

    const url = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName || 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 300,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `HTTP ${response.status}`;
      if ((response.status === 503 || response.status === 429) && _retries > 0) {
        await new Promise(r => setTimeout(r, 1200));
        return this.callOpenAIAPI(question, onChunk, _retries - 1);
      }
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiResponse = '';
    let sentenceBuffer = '';

    while (true) {
      const { done, value } = reader ? await reader.read() : { done: true };
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            aiResponse += token;
            if (onChunk) {
              sentenceBuffer += token;
              const sentenceEnd = /^(.*?[.!?])\s+(.*)$/s;
              let m;
              while ((m = sentenceEnd.exec(sentenceBuffer)) !== null) {
                const complete = m[1].trim();
                if (complete) onChunk(complete);
                sentenceBuffer = m[2];
              }
              if (sentenceBuffer.split(/\s+/).length >= 10) {
                const commaIdx = sentenceBuffer.indexOf(',');
                if (commaIdx > 15) {
                  onChunk(sentenceBuffer.substring(0, commaIdx).trim());
                  sentenceBuffer = sentenceBuffer.substring(commaIdx + 1).trim();
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    if (onChunk && sentenceBuffer.trim()) onChunk(sentenceBuffer.trim());
    aiResponse = aiResponse || 'No response generated';

    this.chatHistory.push({ role: 'user', content: question });
    this.chatHistory.push({ role: 'assistant', content: aiResponse });
    if (this.chatHistory.length > this.MAX_HISTORY * 2) {
      this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY * 2);
    }

    return aiResponse;
  }

  async testConnection() {
    if (!this.apiKey) return { success: false, error: 'No OpenAI API Key' };
    try {
      const result = await this.callOpenAIAPI('Ping');
      return { success: true, message: 'OpenAI Connection Successful' };
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

export default ModuleOpenAI;
