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
    this.modelName = 'gemini-2.5-flash'; // fallback; overridden by fetchBestModel() on init
    this.chatHistory = [];
    this.MAX_HISTORY = 10;
    this.systemContext = null;
  }

  async fetchBestModel() {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const available = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('streamGenerateContent'))
        .map(m => m.name.replace('models/', ''));

      // Prefer newest flash → pro → any flash → first available
      const preference = [
        'gemini-2.5-flash', 'gemini-2.5-pro',
        'gemini-2.5-flash', 'gemini-1.5-flash',
      ];
      for (const p of preference) {
        if (available.includes(p)) return p;
      }
      return available.find(m => m.includes('flash')) || available[0] || null;
    } catch (e) {
      return null;
    }
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

    try {
      if (!navigator.onLine) {
        return { success: false, error: 'Internet connection required for Online Mode.' };
      }

      const best = await this.fetchBestModel();
      if (best) {
        this.modelName = best;
        console.log('[Gemini] Auto-selected model:', best);
      } else {
        console.warn('[Gemini] Could not fetch model list — using fallback:', this.modelName);
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

  async processQuestion(question, onChunk = null) {
    if (!this.isInitialized || !this.isActive) {
      const initResult = await this.initialize();
      if (!initResult.success) throw new Error(initResult.error);
    }

    try {
      const response = await this.callGeminiAPI(question, onChunk);

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

  async callGeminiAPI(question, onChunk = null, _retries = 2) {
    const userContext = localStorage.getItem('ai_system_instructions') || "You are a helpful, professional AI assistant. Keep responses concise.";

    // Detect TTS voice language — Gemini must respond in a language the voice can speak.
    // Microsoft Zira (English) cannot pronounce Devanagari; response would be completely silent.
    const ttsVoiceName = (JSON.parse(localStorage.getItem('voice_settings') || '{}').voice || '').toLowerCase();
    const ttsLang = ttsVoiceName.includes('hindi') || ttsVoiceName.includes('hemant') || ttsVoiceName.includes('kalpana') ? 'Hindi'
                  : ttsVoiceName.includes('tamil') ? 'Tamil'
                  : ttsVoiceName.includes('telugu') ? 'Telugu'
                  : ttsVoiceName.includes('bengali') ? 'Bengali'
                  : 'English';

    // systemInstruction is the authoritative field — Gemini follows it much more strictly than
    // instructions embedded in the user turn content.
    const systemText = `${userContext}\n\nLANGUAGE RULE: Always respond in ${ttsLang}. Never use any other language or script, regardless of what language the user speaks in.`;

    let userPrompt = '';
    if (this.systemContext) {
      userPrompt += `Foundation Knowledge:\n${this.systemContext}\n\nStrictly answer based on this knowledge if relevant.\n\n`;
    }
    userPrompt += `User Question: ${question}`;

    // Drop history turns that contain significant foreign-script content — they can bias Gemini
    // into using that script even when system_instruction says otherwise.
    const nonAsciiRatio = (str) => {
      const nonAscii = (str.match(/[^\x00-\x7F]/g) || []).length;
      return str.length > 0 ? nonAscii / str.length : 0;
    };
    const filteredHistory = ttsLang === 'English'
      ? this.chatHistory.filter(msg => nonAsciiRatio(msg.content) < 0.3)
      : this.chatHistory;

    const contents = [];
    filteredHistory.forEach(msg => {
      contents.push({ role: msg.role, parts: [{ text: msg.content }] });
    });
    contents.push({ role: 'user', parts: [{ text: userPrompt }] });

    // Streaming endpoint — first token arrives much sooner than waiting for full response
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300, // Voice answers are short — less generation = faster first token
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `HTTP ${response.status}`;
      if ((response.status === 503 || response.status === 429) && _retries > 0) {
        console.warn(`[Gemini] ${response.status} — retrying (${_retries} left)...`);
        await new Promise(r => setTimeout(r, 1200));
        return this.callGeminiAPI(question, onChunk, _retries - 1);
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
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
        } catch (e) {}
      }
    }

    if (onChunk && sentenceBuffer.trim()) onChunk(sentenceBuffer.trim());
    aiResponse = aiResponse || 'No response generated';

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
