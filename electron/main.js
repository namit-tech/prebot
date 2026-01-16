const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'PreBot - Offline AI Assistant',
    show: false,
    titleBarStyle: 'default'
  });

  // Load the React app
  if (isDev) {
    // Development: Load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load from built files
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PreBot',
          click: () => {
            // Show about dialog
            console.log('PreBot - Offline AI Assistant');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for Electron-specific features
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// WiFi Hotspot handlers
ipcMain.handle('start-hotspot', async (event, { ssid, password }) => {
  try {
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows: Use netsh to create hotspot
      await execAsync(`netsh wlan set hostednetwork mode=allow ssid="${ssid}" key="${password}"`);
      await execAsync('netsh wlan start hostednetwork');
      
      // Get IP address
      const { stdout } = await execAsync('netsh interface ip show address "Local Area Connection*"');
      const ipMatch = stdout.match(/IP Address:\s*(\d+\.\d+\.\d+\.\d+)/);
      const ip = ipMatch ? ipMatch[1] : '192.168.137.1';
      
      return {
        success: true,
        networkInfo: {
          ssid,
          password,
          ip
        }
      };
    } else if (platform === 'darwin') {
      // macOS: Use networksetup (requires admin)
      return {
        success: false,
        error: 'macOS hotspot requires manual setup'
      };
    } else {
      // Linux: Use nmcli or hostapd
      return {
        success: false,
        error: 'Linux hotspot requires manual setup'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('stop-hotspot', async () => {
  try {
    if (process.platform === 'win32') {
      await execAsync('netsh wlan stop hostednetwork');
      return { success: true };
    }
    return { success: false, error: 'Not supported on this platform' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-hotspot-status', async () => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('netsh wlan show hostednetwork');
      const isRunning = stdout.includes('Started');
      
      if (isRunning) {
        const ssidMatch = stdout.match(/SSID name\s*:\s*"(.+)"/);
        const ssid = ssidMatch ? ssidMatch[1] : 'PreBot-Hotspot';
        
        return {
          isRunning: true,
          networkInfo: {
            ssid,
            ip: '192.168.137.1'
          }
        };
      }
    }
    return { isRunning: false };
  } catch (error) {
    return { isRunning: false };
  }
});

ipcMain.handle('get-local-ip', async () => {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '192.168.137.1';
  } catch (error) {
    return '192.168.137.1';
  }
});

// Video management handlers
const videosDir = path.join(app.getPath('userData'), 'videos');

ipcMain.handle('save-video', async (event, filePath, fileName) => {
  try {
    await fs.mkdir(videosDir, { recursive: true });
    const destPath = path.join(videosDir, fileName);
    await fs.copyFile(filePath, destPath);
    return { success: true, path: destPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-video', async (event, videoPath) => {
  try {
    await fs.unlink(videoPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-primary-video', async (event, video) => {
  // Store primary video info
  const primaryVideoPath = path.join(app.getPath('userData'), 'primary-video.json');
  await fs.writeFile(primaryVideoPath, JSON.stringify(video));
  return { success: true };
});

// Hologram control handlers
ipcMain.handle('play-hologram-video', async (event, video) => {
  try {
    const videoPath = video.path || path.join(videosDir, video.name);
    
    // Check if VLC is available
    const vlcCommand = process.platform === 'win32' 
      ? `vlc "${videoPath}" --loop --fullscreen --no-audio --video-on-top`
      : `vlc "${videoPath}" --loop --fullscreen --no-audio`;
    
    exec(vlcCommand, (error) => {
      if (error) {
        console.error('VLC error:', error);
      }
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-hologram-video', async () => {
  try {
    // Kill VLC process
    if (process.platform === 'win32') {
      exec('taskkill /F /IM vlc.exe', () => {});
    } else {
      exec('pkill vlc', () => {});
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-hologram-status', async () => {
  // Check if HDMI output is available (simplified check)
  return { isConnected: true }; // In production, check actual HDMI connection
});

