const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  updateQuestions: (questions) => ipcRenderer.invoke('update-questions', questions),
  saveQuestions: (questions) => ipcRenderer.invoke('save-questions', questions),
  setActiveModule: (moduleId) => ipcRenderer.invoke('set-active-module', moduleId),
  setMobilePresetsEnabled: (enabled) => ipcRenderer.invoke('set-mobile-presets-enabled', enabled),
  
  // User Session Sync
  // User Session Sync
  
  // Piper TTS
  generateSpeech: (text, voice) => ipcRenderer.invoke('generate-speech', { text, voice }),
  getPiperVoices: () => ipcRenderer.invoke('get-piper-voices'),

  // Per-tenant analytics & API metering. Records are attributed in the main process
  // from the verified session, so the renderer never states its own tenant identity.
  recordInteraction: (payload) => ipcRenderer.invoke('record-interaction', payload),
  recordUsage: (payload) => ipcRenderer.invoke('record-usage', payload),
  getUsageAnalytics: (opts) => ipcRenderer.invoke('get-usage-analytics', opts || {}),

  // Streaming Piper TTS — raw PCM pushed as it is produced, cancellable for barge-in
  piperStreamStart: (text, voice, streamId) =>
    ipcRenderer.invoke('piper-stream-start', { text, voice, streamId }),
  piperStreamCancel: (streamId) => ipcRenderer.invoke('piper-stream-cancel', { streamId }),
  onPiperStreamChunk: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on('piper-stream-chunk', subscription);
    return () => ipcRenderer.removeListener('piper-stream-chunk', subscription);
  },
  onPiperStreamEnd: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on('piper-stream-end', subscription);
    return () => ipcRenderer.removeListener('piper-stream-end', subscription);
  },
  onPiperStreamError: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on('piper-stream-error', subscription);
    return () => ipcRenderer.removeListener('piper-stream-error', subscription);
  },

  // Offline STT
  startSTT: (language, profile) => ipcRenderer.invoke('start-stt', { language, profile }),
  stopSTT: () => ipcRenderer.invoke('stop-stt'),
  transcribeAudio: (audioBuffer, language) => ipcRenderer.invoke('transcribe-audio', { audioBuffer, language }),
  onSTTText: (callback) => {
    const subscription = (event, text) => callback(text);
    ipcRenderer.on('stt-text', subscription);
    return () => ipcRenderer.removeListener('stt-text', subscription);
  },
  onSTTStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('stt-status', subscription);
    return () => ipcRenderer.removeListener('stt-status', subscription);
  },
  onSTTLevel: (callback) => {
    const subscription = (event, level) => callback(level);
    ipcRenderer.on('stt-level', subscription);
    return () => ipcRenderer.removeListener('stt-level', subscription);
  },
  onSTTDiag: (callback) => {
    const subscription = (event, msg) => callback(msg);
    ipcRenderer.on('stt-diag', subscription);
    return () => ipcRenderer.removeListener('stt-diag', subscription);
  },
  onSTTError: (callback) => {
    const subscription = (event, err) => callback(err);
    ipcRenderer.on('stt-error', subscription);
    return () => ipcRenderer.removeListener('stt-error', subscription);
  },
  
  savePassword: (password) => ipcRenderer.invoke('save-password', password),
  saveHeading: (heading) => ipcRenderer.invoke('save-heading', heading),
  saveVideosToFile: (videos) => ipcRenderer.invoke('save-videos', videos),
  saveVideoFile: (videoData) => ipcRenderer.invoke('save-video-file', videoData),
  saveVideo: (filePath, fileName) => ipcRenderer.invoke('save-video', { filePath, fileName }),
  readDocument: (filePath) => ipcRenderer.invoke('read-document', filePath),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  getHologramStatus: () => ipcRenderer.invoke('get-hologram-status'),
  playHologramVideo: (video) => ipcRenderer.invoke('play-hologram-video', video),
  stopHologramVideo: () => ipcRenderer.invoke('stop-hologram-video'),
  setPrimaryVideo: (video) => ipcRenderer.invoke('set-primary-video', video),
  deleteVideo: (videoId) => ipcRenderer.invoke('delete-video', videoId),
  
  // Authentication — the session is minted and verified in the main process
  authLogin: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  authGetSession: () => ipcRenderer.invoke('auth:get-session'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  // WiFi Hotspot
  getHotspotStatus: () => ipcRenderer.invoke('get-hotspot-status'),
  startHotspot: (ssid, password) => ipcRenderer.invoke('start-hotspot', { ssid, password }),
  stopHotspot: () => ipcRenderer.invoke('stop-hotspot'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  setUserSession: async (userData) => {
    console.log('[Preload] Invoking set-user-session IPC', userData?.email);
    try {
      const result = await ipcRenderer.invoke('set-user-session', userData);
      console.log('[Preload] set-user-session result:', result);
      return result;
    } catch (e) {
      console.error('[Preload] set-user-session FAILED:', e);
      throw e;
    }
  },
  
  // Mobile Chat Bridge (AI Brain)
  sendAIResponse: (data) => ipcRenderer.send('ai-response', data),
  
  onMobileChatRequest: (callback) => {
    // Singleton pattern: Removal handled by creating a unique function or managing state if needed.
    // Ideally user should cleanup, but we can ensure we don't leak by tracking here if we wanted.
    // For now, relying on React cleanup. But let's add logs to debug.
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-chat-request', subscription);
    return () => {
        console.log('🔌 preload.js: Removing mobile-chat-request listener');
        ipcRenderer.removeListener('mobile-chat-request', subscription);
    };
  },

  onNewChatMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('new-chat-message', subscription);
    return () => {
        console.log('🔌 preload.js: Removing new-chat-message listener');
        ipcRenderer.removeListener('new-chat-message', subscription);
    };
  },
  
  // Singleton variables to prevent stacking
  _activeQuestionHandler: null,

  // Listen for mobile questions from main process
  onMobileQuestion: (callback) => {
    // 1. Remove existing listener if present (Safety Enforcer)
    if (window._activeQuestionHandler) {
       console.log('🛡️ preload.js: Removing STALE mobile-question listener before adding new one');
       ipcRenderer.removeListener('mobile-question', window._activeQuestionHandler);
    }

    // 2. Create new handler
    const subscription = (event, data) => {
      console.log('📱 preload.js: Received mobile-question event:', data);
      callback(data);
    };
    
    // 3. Store reference
    window._activeQuestionHandler = subscription;

    // 4. Add Listener
    ipcRenderer.on('mobile-question', subscription);
    console.log('✅ preload.js: Added new mobile-question listener');

    return () => {
       console.log('🔌 preload.js: Cleanup requested for mobile-question');
       ipcRenderer.removeListener('mobile-question', subscription);
       if (window._activeQuestionHandler === subscription) {
           window._activeQuestionHandler = null;
       }
    };
  },
  
  
  // Ollama Automation
  ollamaCheck: () => ipcRenderer.invoke('ollama:check-setup'),
  ollamaCheckSetup: (targetModel) => ipcRenderer.invoke('ollama:check-setup', targetModel),
  ollamaConfigure: () => ipcRenderer.invoke('ollama:configure'),
  ollamaVerify: () => ipcRenderer.invoke('ollama:verify'),
  ollamaInstallModel: (modelName) => ipcRenderer.invoke('ollama:install-model', modelName),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  getOllamaLogs: () => ipcRenderer.invoke('get-ollama-logs'),
  checkBridgeStatus: () => ipcRenderer.invoke('check-bridge-status'),
  
  onOllamaProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('ollama-progress', subscription);
    return () => ipcRenderer.removeListener('ollama-progress', subscription);
  },

  onOllamaLog: (callback) => {
    const subscription = (event, msg) => {
        // Log to DevTools console automatically
        console.log('[OllamaSetup]', msg); 
        // Proceed to callback
        callback(msg);
    };
    ipcRenderer.on('ollama-log', subscription);
    return () => ipcRenderer.removeListener('ollama-log', subscription);
  },

  // Whisper Setup Automation
  whisperAuditHardware: () => ipcRenderer.invoke('whisper:audit-hardware'),
  whisperCheckSetup: () => ipcRenderer.invoke('whisper:check-setup'),
  whisperDownloadModel: () => ipcRenderer.invoke('whisper:download-model'),
  getSystemSpecs: () => ipcRenderer.invoke('get-system-specs'),
  onWhisperProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('whisper-setup-progress', subscription);
    return () => ipcRenderer.removeListener('whisper-setup-progress', subscription);
  },

  onExternalAIResponse: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('external-ai-response', subscription);
    return () => ipcRenderer.removeListener('external-ai-response', subscription);
  },

  onExternalAIThinking: (callback) => {
    const subscription = (event) => callback();
    ipcRenderer.on('external-ai-thinking', subscription);
    return () => ipcRenderer.removeListener('external-ai-thinking', subscription);
  },
  
  // Platform detection
  platform: process.platform,
  // App info
  isElectron: true,
  isDev: process.argv.includes('--dev')
});
