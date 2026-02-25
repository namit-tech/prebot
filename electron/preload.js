const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Platform detection
  platform: process.platform,
  isElectron: true,
  isDev: process.env.NODE_ENV === 'development',
  
  // WiFi Hotspot
  startHotspot: (config) => ipcRenderer.invoke('start-hotspot', config),
  stopHotspot: () => ipcRenderer.invoke('stop-hotspot'),
  getHotspotStatus: () => ipcRenderer.invoke('get-hotspot-status'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  
  // Video Management
  saveVideo: (filePath, fileName) => ipcRenderer.invoke('save-video', filePath, fileName),
  deleteVideo: (videoPath) => ipcRenderer.invoke('delete-video', videoPath),
  setPrimaryVideo: (video) => ipcRenderer.invoke('set-primary-video', video),
  
  // Hologram Control
  playHologramVideo: (video) => ipcRenderer.invoke('play-hologram-video', video),
  stopHologramVideo: () => ipcRenderer.invoke('stop-hologram-video'),
  getHologramStatus: () => ipcRenderer.invoke('get-hologram-status'),
  
  // Ollama Setup
  ollamaCheck: () => ipcRenderer.invoke('ollama:check-setup'),
  ollamaCheckSetup: () => ipcRenderer.invoke('ollama:check-setup'),
  ollamaConfigure: () => ipcRenderer.invoke('ollama:configure'),
  ollamaVerify: () => ipcRenderer.invoke('ollama:verify'),
  ollamaInstallModel: (modelName) => ipcRenderer.invoke('ollama:install-model', modelName),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  
  onOllamaProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('ollama-progress', subscription);
    return () => ipcRenderer.removeListener('ollama-progress', subscription);
  },

  onOllamaLog: (callback) => {
    const subscription = (event, msg) => {
        console.log('[OllamaSetup]', msg); 
        callback(msg);
    };
    ipcRenderer.on('ollama-log', subscription);
    return () => ipcRenderer.removeListener('ollama-log', subscription);
  }
});


