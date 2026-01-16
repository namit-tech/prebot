// Electron utilities
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI;
};

export const getElectronInfo = () => {
  if (!isElectron()) {
    return null;
  }

  return {
    platform: window.electronAPI.platform,
    isDev: window.electronAPI.isDev,
    getVersion: () => window.electronAPI.getAppVersion(),
    getPlatform: () => window.electronAPI.getPlatform()
  };
};

