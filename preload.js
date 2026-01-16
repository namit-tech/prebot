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
  
  // User Session Sync
  setUserSession: (sessionData) => ipcRenderer.invoke('set-user-session', sessionData),
  
  // Piper TTS
  generateSpeech: (text, voice) => ipcRenderer.invoke('generate-speech', { text, voice }),
  getPiperVoices: () => ipcRenderer.invoke('get-piper-voices'),
  
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
  ollamaCheck: () => ipcRenderer.invoke('ollama-check'),
  ollamaInstall: () => ipcRenderer.invoke('ollama-install'),
  ollamaPull: (model) => ipcRenderer.invoke('ollama-pull', model),
  ollamaList: () => ipcRenderer.invoke('ollama-list'),
  
  onOllamaProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('ollama-progress', subscription);
    return () => ipcRenderer.removeListener('ollama-progress', subscription);
  },

  // Platform detection
  platform: process.platform,
  // App info
  isElectron: true,
  isDev: process.argv.includes('--dev')
});
