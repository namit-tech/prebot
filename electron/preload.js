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
  getHologramStatus: () => ipcRenderer.invoke('get-hologram-status')
});

