const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let desktopServer = null;
let pc2Server = null;

// Show startup message in console
console.log('\n');
console.log('========================================');
console.log('🤖 Offline AI Assistant - Starting...');
console.log('========================================');
console.log('📦 Version: 1.0.0');
console.log('🖥️  Platform:', process.platform);
console.log('📁 App Path:', __dirname);
console.log('========================================');
console.log('\n');

// Enable console output for packaged app (so errors are visible in CMD)
if (process.platform === 'win32') {
  // Keep console window open on Windows
  const originalWrite = process.stdout.write;
  process.stdout.write = function(chunk, encoding, fd) {
    originalWrite.call(process.stdout, chunk, encoding, fd);
    return true;
  };
}

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (error) => {
  const errorMsg = `\n\n========================================\n❌ UNCAUGHT EXCEPTION\n========================================\n${error.message}\n\nStack Trace:\n${error.stack}\n========================================\n\n`;
  console.error(errorMsg);
  
  // Also write to stderr
  process.stderr.write(errorMsg);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox('Application Error', `An error occurred: ${error.message}\n\nCheck the console/command prompt for details.`);
  } else {
    // If window doesn't exist yet, show error and wait before quitting
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}\n\nCheck the command prompt window for full error details.`);
    console.error('\n⚠️  Application will exit in 10 seconds. Check the error above.\n');
    setTimeout(() => {
      app.quit();
    }, 10000); // Wait 10 seconds before quitting
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = `\n\n========================================\n❌ UNHANDLED PROMISE REJECTION\n========================================\nReason: ${reason}\nPromise: ${promise}\n========================================\n\n`;
  console.error(errorMsg);
  process.stderr.write(errorMsg);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox('Application Error', `An unhandled error occurred: ${reason}\n\nCheck the console/command prompt for details.`);
  } else {
    console.error('\n⚠️  Check the error above. Application may continue or exit.\n');
  }
});

// Try to load server modules (they might fail in packaged app)
let DesktopServer, PC2Server;
try {
  DesktopServer = require('./desktop-server');
  PC2Server = require('./pc2-server');
} catch (error) {
  console.error('Failed to load server modules:', error);
  // Continue anyway - servers are optional
}

// Helper function to get writable data directory (works for portable and installed apps)
function getDataDirectory() {
  // For portable apps, use userData which is writable
  // This ensures data persists and is writable even in portable mode
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  
  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Also ensure assets/videos directory exists in userData
  const videosDir = path.join(userDataPath, 'assets', 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  
  // Copy initial assets from app bundle to userData on first run (if needed)
  copyInitialAssets(userDataPath);
  
  return {
    dataDir: dataDir,
    videosDir: videosDir,
    userDataPath: userDataPath
  };
}

// Copy initial assets from app bundle to userData (for portable apps)
function copyInitialAssets(userDataPath) {
  try {
    const appAssetsPath = path.join(__dirname, 'assets');
    const userAssetsPath = path.join(userDataPath, 'assets');
    const userVideosPath = path.join(userAssetsPath, 'videos');
    
    // Only copy if app assets exist and user assets don't exist yet
    if (fs.existsSync(appAssetsPath) && !fs.existsSync(userAssetsPath)) {
      console.log('📦 Copying initial assets to user data directory...');
      
      // Create directories
      if (!fs.existsSync(userAssetsPath)) {
        fs.mkdirSync(userAssetsPath, { recursive: true });
      }
      if (!fs.existsSync(userVideosPath)) {
        fs.mkdirSync(userVideosPath, { recursive: true });
      }
      
      // Copy videos from app bundle to user data (if they exist)
      const appVideosPath = path.join(appAssetsPath, 'videos');
      if (fs.existsSync(appVideosPath)) {
        const videoFiles = fs.readdirSync(appVideosPath).filter(file => 
          file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mov')
        );
        
        videoFiles.forEach(videoFile => {
          const srcPath = path.join(appVideosPath, videoFile);
          const destPath = path.join(userVideosPath, videoFile);
          
          // Only copy if destination doesn't exist
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`📹 Copied video: ${videoFile}`);
          }
        });
      }
      
      // Copy icon if it exists (try .ico, .png, .icns)
      const iconExtensions = ['ico', 'png', 'icns'];
      for (const ext of iconExtensions) {
        const iconPath = path.join(appAssetsPath, `icon.${ext}`);
        if (fs.existsSync(iconPath)) {
          const destIconPath = path.join(userAssetsPath, `icon.${ext}`);
          if (!fs.existsSync(destIconPath)) {
            fs.copyFileSync(iconPath, destIconPath);
            console.log(`✅ Copied icon.${ext} to user data directory`);
          }
          break; // Only copy the first found icon
        }
      }
      
      console.log('✅ Initial assets copied successfully');
    }
  } catch (error) {
    console.warn('⚠️ Could not copy initial assets (this is okay):', error.message);
  }
}

function createWindow() {
  try {
    console.log('📝 Creating application window...');
    console.log('📁 App directory:', __dirname);
    
    // Check if preload file exists
    const preloadPath = path.join(__dirname, 'preload.js');
    const preloadExists = fs.existsSync(preloadPath);
    
    if (!preloadExists) {
      console.warn('⚠️  preload.js not found, continuing without it');
    } else {
      console.log('✅ preload.js found');
    }

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: preloadExists ? preloadPath : undefined,
        webSecurity: false // Allow loading local audio files from Piper
      },
      icon: (() => {
        // Try .ico first (Windows standard), then .png, then .icns (macOS)
        const iconPaths = [
          path.join(__dirname, 'assets', 'icon.ico'),
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, 'assets', 'icon.icns')
        ];
        for (const iconPath of iconPaths) {
          if (fs.existsSync(iconPath)) {
            console.log('✅ Using icon:', iconPath);
            return iconPath;
          }
        }
        console.warn('⚠️  No icon file found in assets folder');
        return undefined;
      })(),
      title: 'Offline AI Assistant',
      show: false, // Don't show until ready
      titleBarStyle: 'default'
    });

    // Check if index.html exists
    const indexPath = path.join(__dirname, 'index.html');
    console.log('📄 Checking for index.html at:', indexPath);
    
    if (!fs.existsSync(indexPath)) {
      const errorMsg = `\n❌ CRITICAL ERROR: index.html not found!\n   Expected location: ${indexPath}\n   Current directory: ${__dirname}\n`;
      console.error(errorMsg);
      process.stderr.write(errorMsg);
      throw new Error(`index.html not found at: ${indexPath}`);
    }
    
    console.log('✅ index.html found, loading...');

    // Load the app
    mainWindow.loadFile('index.html').then(() => {
      console.log('✅ index.html loaded successfully');
    }).catch((error) => {
      const errorMsg = `\n\n========================================\n❌ ERROR LOADING index.html\n========================================\n${error.message}\n\nStack Trace:\n${error.stack}\n========================================\n\n`;
      console.error(errorMsg);
      process.stderr.write(errorMsg);
      dialog.showErrorBox('Load Error', `Failed to load application: ${error.message}\n\nCheck the command prompt for full error details.`);
    });

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      
      // Focus on the window
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

    // Enable developer tools for debugging (only in development)
    // Commented out for production builds
    // mainWindow.webContents.openDevTools();
    
    // Handle page load errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      const errorMsg = `\n\n========================================\n❌ PAGE LOAD FAILED\n========================================\nError Code: ${errorCode}\nDescription: ${errorDescription}\nURL: ${validatedURL || 'index.html'}\n========================================\n\n`;
      console.error(errorMsg);
      process.stderr.write(errorMsg);
      dialog.showErrorBox('Load Error', `Failed to load application: ${errorDescription}\n\nFile: ${validatedURL || 'index.html'}\n\nCheck the command prompt for details.`);
    });
    
    // Handle renderer process crashes
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      const errorMsg = `\n\n========================================\n❌ RENDERER PROCESS CRASHED\n========================================\nReason: ${details.reason || 'Unknown'}\nExit Code: ${details.exitCode || 'N/A'}\n========================================\n\n`;
      console.error(errorMsg);
      process.stderr.write(errorMsg);
      dialog.showErrorBox('Application Crashed', `The application window crashed: ${details.reason || 'Unknown reason'}\n\nCheck the command prompt for details.`);
    });
    
    // Start desktop server for mobile access (with error handling)
    try {
      startDesktopServer();
    } catch (error) {
      console.error('Failed to start desktop server:', error);
      // Continue anyway - server is optional
    }
    
    // Start PC2 server for video animation (with error handling)
    try {
      startPC2Server();
    } catch (error) {
      console.error('Failed to start PC2 server:', error);
      // Continue anyway - server is optional
    }
  } catch (error) {
    const errorMsg = `\n\n========================================\n❌ ERROR CREATING WINDOW\n========================================\n${error.message}\n\nStack Trace:\n${error.stack}\n========================================\n\n`;
    console.error(errorMsg);
    process.stderr.write(errorMsg);
    dialog.showErrorBox('Window Creation Error', `Failed to create application window: ${error.message}\n\nCheck the command prompt for full error details.`);
    console.error('\n⚠️  Application will exit in 10 seconds. Check the error above.\n');
    setTimeout(() => {
      app.quit();
    }, 10000);
  }
}

// IPC handlers for server control
ipcMain.handle('start-server', async () => {
  if (!desktopServer) {
    startDesktopServer();
    return { success: true, message: 'Server started' };
  }
  return { success: true, message: 'Server already running' };
});

ipcMain.handle('stop-server', async () => {
  if (desktopServer) {
    desktopServer.stop();
    desktopServer = null;
    return { success: true, message: 'Server stopped' };
  }
  return { success: true, message: 'Server not running' };
});

ipcMain.handle('get-server-info', async () => {
  if (desktopServer) {
    return { 
      success: true, 
      running: true, 
      port: desktopServer.port,
      message: 'Server is running' 
    };
  }
  return { 
    success: false, 
    running: false, 
    message: 'Server not running' 
  };
});

ipcMain.handle('update-questions', async (event, questions) => {
  if (desktopServer) {
    desktopServer.updateQuestions(questions);
    return { success: true };
  }
  return { success: false };
});

// Piper TTS Handler
const piperHandler = require('./piper-handler');
const os = require('os');
const crypto = require('crypto');

// IPC: Generate Speech
ipcMain.handle('generate-speech', async (event, { text, voice }) => {
  try {
    console.log(`[IPC] generate-speech received: "${text.substring(0, 20)}..." (${voice})`);
    const audioPath = await piperHandler.generateSpeech(text, voice);
    return { success: true, audioPath };
  } catch (error) {
    console.error('[IPC] generate-speech failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Get Piper Voices
ipcMain.handle('get-piper-voices', async () => {
    return piperHandler.getVoices();
});

// Machine ID Handler (Soft Lock)
ipcMain.handle('get-machine-id', () => {
  try {
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown-cpu';
    const platform = os.platform();
    const arch = os.arch();

    const fingerprint = `${hostname}-${username}-${cpuModel}-${platform}-${arch}`;
    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    
    console.log('[Main] Generated Machine ID:', hash);
    return hash;
  } catch (error) {
    console.error('[Main] Error generating machine ID:', error);
    return 'fallback-machine-id-' + Date.now();
  }
});

ipcMain.handle('set-user-session', async (event, userData) => {
  console.log('🔄 [Main] Received set-user-session request:', userData?.email);
  if (desktopServer) {
    console.log('✅ [Main] Updating Desktop Server session...');
    desktopServer.updateUserSession(userData);
    return { success: true };
  }
  console.warn('⚠️ [Main] Desktop Server NOT ready yet.');
  return { success: false };
});

// Handle mobile question requests
ipcMain.on('mobile-question', (event, data) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('mobile-question', data);
  }
});

// Poll for pending mobile questions
// [CLEANUP] Removed polling loop (redundant). 
// DesktopServer now PUSHES questions directly to renderer via sendToMain().
// This prevents "Double Audio" (Push + Poll race condition).

// Handle hologram triggers
ipcMain.on('trigger-hologram', (event, data) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('trigger-hologram', data);
  }
});

// Hologram Management Handlers (Added for PC2/Client Dashboard)
ipcMain.handle('set-primary-video', async (event, video) => {
  try {
    const dataPaths = getDataDirectory();
    // Save to primary-video.json in userData
    const primaryVideoPath = path.join(app.getPath('userData'), 'primary-video.json');
    fs.writeFileSync(primaryVideoPath, JSON.stringify(video));
    console.log('✅ Primary video set:', video.name);
    return { success: true };
  } catch (error) {
    console.error('Failed to set primary video:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('play-hologram-video', async (event, video) => {
  try {
    const { exec } = require('child_process');
    const dataPaths = getDataDirectory();
    // Ensure video path is correct
    // If video object has path, use it. If not, construct from name + videosDir
    const videoPath = video.path || path.join(dataPaths.videosDir, video.name);
    
    console.log(`🎬 Playing Hologram Video: ${videoPath}`);

    // Trigger PC2 Browser Server (if running)
    if (pc2Server) {
        console.log('🌐 Triggering PC2 Browser Display...');
        pc2Server.startAnimation();
    }

    // Check if VLC is available
    // Using --no-audio because we use TTS for sound? Or user wants video sound?
    // User said "System giving any sound" implies they expect SOUND.
    // BUT TTS is handling the speech.
    // If video has sound, it might clash.
    // The previous code had --no-audio. Sticking to it unless user requested video audio.
    // Wait, user said "System not producing the sound... as per I prompted".
    // This implies they expect TTS Response.
    // So --no-audio on video is correct (Video is just visual face).
    
    const vlcCommand = process.platform === 'win32' 
      ? `vlc "${videoPath}" --loop --fullscreen --no-audio --video-on-top --no-video-title-show`
      : `vlc "${videoPath}" --loop --fullscreen --no-audio`;
    
    // Kill existing vlc first
    if (process.platform === 'win32') {
        exec('taskkill /F /IM vlc.exe', () => {
             // Ignore error if not running, then start
             exec(vlcCommand, (error) => {
                if (error) console.error('VLC Start Error:', error);
             });
        });
    } else {
        exec('pkill vlc', () => {
             exec(vlcCommand, (error) => {});
        });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Hologram Play Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-hologram-video', async () => {
  try {
    const { exec } = require('child_process');
    console.log('⏹️ Stopping Hologram Video...');
    
    // Stop PC2 Browser Server (if running)
    if (pc2Server) {
        console.log('🌐 Stopping PC2 Browser Display...');
        pc2Server.stopAnimation();
    }

    // Kill VLC process
    if (process.platform === 'win32') {
      exec('taskkill /F /IM vlc.exe', (err) => {
          if(!err) console.log('✅ VLC Stopped');
      });
    } else {
      exec('pkill vlc', () => {});
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete video file
ipcMain.handle('delete-video', async (event, videoName) => {
  try {
    const dataPaths = getDataDirectory();
    // Path might be a full path or just a filename
    let videoPath = videoName;
    if (!path.isAbsolute(videoName)) {
        videoPath = path.join(dataPaths.videosDir, videoName);
    }
    
    if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
        console.log('🗑️ Deleted video:', videoPath);
        return { success: true };
    } else {
        return { success: false, error: 'File not found' };
    }
  } catch (error) {
    console.error('Delete Video Error:', error);
    return { success: false, error: error.message };
  }
});



function startDesktopServer() {
  try {
    if (!DesktopServer) {
      console.warn('DesktopServer module not available');
      return;
    }
    const dataPaths = getDataDirectory();
    desktopServer = new DesktopServer(dataPaths.dataDir);
    console.log('🌐 Desktop server started for mobile access');
  } catch (error) {
    console.error('Failed to start desktop server:', error);
    // Don't throw - server is optional
  }
}

function startPC2Server() {
  try {
    if (!PC2Server) {
      console.warn('PC2Server module not available');
      return;
    }
    const dataPaths = getDataDirectory();
    pc2Server = new PC2Server(dataPaths.dataDir, dataPaths.videosDir);
    console.log('🎬 PC2 video server started (integrated - video will trigger automatically)');
  } catch (error) {
    console.error('Failed to start PC2 server:', error);
    // Don't throw - server is optional
  }
}

// App event handlers
app.whenReady().then(() => {
  try {
    console.log('✅ Electron app is ready, creating window...');
    createWindow();
    createMenu();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    const errorMsg = `\n\n========================================\n❌ ERROR IN APP.WHENREADY\n========================================\n${error.message}\n\nStack Trace:\n${error.stack}\n========================================\n\n`;
    console.error(errorMsg);
    process.stderr.write(errorMsg);
    dialog.showErrorBox('Startup Error', `Failed to create application window: ${error.message}\n\nCheck the command prompt for full error details.`);
    console.error('\n⚠️  Application will exit in 10 seconds. Check the error above.\n');
    setTimeout(() => {
      app.quit();
    }, 10000);
  }
}).catch((error) => {
  const errorMsg = `\n\n========================================\n❌ ERROR IN APP.WHENREADY PROMISE\n========================================\n${error.message}\n\nStack Trace:\n${error.stack}\n========================================\n\n`;
  console.error(errorMsg);
  process.stderr.write(errorMsg);
  dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}\n\nCheck the command prompt for full error details.`);
  console.error('\n⚠️  Application will exit in 10 seconds. Check the error above.\n');
  setTimeout(() => {
    app.quit();
  }, 10000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Feature: Read Document (PDF/TXT)
ipcMain.handle('read-document', async (event, filePath) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.txt') {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } 
    else if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return { success: true, content: data.text };
    }
    else {
      return { success: false, error: 'Unsupported file type. Please use .pdf or .txt' };
    }
  } catch (error) {
    console.error('Error reading document:', error);
    return { success: false, error: error.message };
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.reload();
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
          label: 'About Offline AI Assistant',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Offline AI Assistant',
              message: 'Offline AI Assistant v1.0.0',
              detail: 'A completely offline AI assistant with predefined questions and answers, text-to-speech functionality, and animated AI face with lip-sync.\n\nBuilt with Electron and modern web technologies.',
              buttons: ['OK']
            });
          }
        },
        {
          label: 'Learn More',
          click: () => {
            shell.openExternal('https://github.com/your-repo/offline-ai-assistant');
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

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for communication with renderer process
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

// Save questions to file for server access
ipcMain.handle('save-questions', async (event, questions) => {
  try {
    const fs = require('fs');
    const dataPaths = getDataDirectory();
    const storageFile = path.join(dataPaths.dataDir, 'questions-storage.json');
    
    // Preserve existing unlockPassword and mobileHeading if file exists
    let existingData = { questions: [], unlockPassword: '', mobileHeading: '', timestamp: new Date().toISOString() };
    if (fs.existsSync(storageFile)) {
      try {
        const fileContent = fs.readFileSync(storageFile, 'utf8');
        existingData = JSON.parse(fileContent);
      } catch (e) {
        console.warn('Could not read existing storage file, creating new one');
      }
    }
    
    const data = {
      questions: questions,
      unlockPassword: existingData.unlockPassword || '',
      mobileHeading: existingData.mobileHeading || '',
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
    console.log(`💾 Questions saved to file: ${questions.length} questions`);
    
    // CRITICAL: Update desktop server with new questions
    if (desktopServer) {
      desktopServer.questions = questions;
      console.log(`✅ Desktop server updated with ${questions.length} questions`);
    } else {
      console.warn('⚠️ Desktop server not initialized yet');
    }
    
    return { success: true, count: questions.length };
  } catch (error) {
    console.error('Error saving questions to file:', error);
    return { success: false, error: error.message };
  }
});

// Save videos to file for PC2 server access
ipcMain.handle('save-videos', async (event, videos) => {
  try {
    const fs = require('fs');
    const dataPaths = getDataDirectory();
    const storageFile = path.join(dataPaths.dataDir, 'video-storage.json');
    
    // Use writable videos directory
    const videosDir = dataPaths.videosDir;
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
      console.log('📁 Created assets/videos directory');
    }
    
    // Save video files to disk (if they have base64 data)
    let savedCount = 0;
    let skippedCount = 0;
    let missingCount = 0;
    
    for (const video of videos) {
      const videoFilePath = path.join(videosDir, video.name);
      
      if (video.data && video.data.startsWith('data:video/')) {
        try {
          // Extract base64 data
          const base64Data = video.data.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Check if file already exists and is the same size
          if (fs.existsSync(videoFilePath)) {
            const existingStats = fs.statSync(videoFilePath);
            if (existingStats.size === buffer.length) {
              console.log(`ℹ️ Video file already exists: ${video.name} (${(buffer.length / 1024).toFixed(2)} KB)`);
              skippedCount++;
              continue;
            } else {
              console.log(`🔄 Updating existing video file: ${video.name}`);
            }
          }
          
          fs.writeFileSync(videoFilePath, buffer);
          console.log(`💾 Saved video file: ${video.name} (${(buffer.length / 1024).toFixed(2)} KB)`);
          savedCount++;
        } catch (fileError) {
          console.error(`❌ Error saving video file ${video.name}:`, fileError.message);
          missingCount++;
        }
      } else {
        // Video doesn't have base64 data - check if file exists on disk
        if (!fs.existsSync(videoFilePath)) {
          console.warn(`⚠️ Video file not found on disk: ${video.name} (no base64 data available)`);
          console.warn(`   Path: ${videoFilePath}`);
          console.warn(`   Please re-upload this video to save it to disk.`);
          missingCount++;
        } else {
          console.log(`✅ Video file exists on disk: ${video.name}`);
          skippedCount++;
        }
      }
    }
    
    console.log(`📊 Video save summary: ${savedCount} saved, ${skippedCount} skipped, ${missingCount} missing`);
    
    // Save metadata to JSON file
    const data = {
      videos: videos,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
    console.log(`💾 Videos metadata saved: ${videos.length} videos`);
    
    return { success: true, count: videos.length };
  } catch (error) {
    console.error('Error saving videos to file:', error);
    return { success: false, error: error.message };
  }
});

// Save individual video file
ipcMain.handle('save-video-file', async (event, videoData) => {
  try {
    const fs = require('fs');
    const dataPaths = getDataDirectory();
    
    // Use writable videos directory
    const videosDir = dataPaths.videosDir;
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
      console.log('📁 Created assets/videos directory');
    }
    
    // Save video file if base64 data exists
    if (videoData.data && videoData.data.startsWith('data:video/')) {
      const base64Data = videoData.data.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const videoFilePath = path.join(videosDir, videoData.name);
      fs.writeFileSync(videoFilePath, buffer);
      console.log(`💾 Saved video file: ${videoData.name} (${(buffer.length / 1024).toFixed(2)} KB)`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving video file:', error);
    return { success: false, error: error.message };
  }
});

// Save video from path (copy file)
ipcMain.handle('save-video', async (event, { filePath, fileName }) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataPaths = getDataDirectory();
    
    // Use writable videos directory
    const videosDir = dataPaths.videosDir;
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }

    const destPath = path.join(videosDir, fileName);
    
    // Copy the file
    fs.copyFileSync(filePath, destPath);
    console.log(`🎥 Copied video from ${filePath} to ${destPath}`);

    return { success: true, path: destPath };
  } catch (error) {
    console.error('Error copying video file:', error);
    throw error; // Propagate error to frontend
  }
});

// Save unlock password to file
ipcMain.handle('save-password', async (event, password) => {
  try {
    const fs = require('fs');
    const dataPaths = getDataDirectory();
    const storageFile = path.join(dataPaths.dataDir, 'questions-storage.json');
    
    // Preserve existing questions and mobileHeading if file exists
    let existingData = { questions: [], unlockPassword: '', mobileHeading: '', timestamp: new Date().toISOString() };
    if (fs.existsSync(storageFile)) {
      try {
        const fileContent = fs.readFileSync(storageFile, 'utf8');
        existingData = JSON.parse(fileContent);
      } catch (e) {
        console.warn('Could not read existing storage file, creating new one');
      }
    }
    
    const data = {
      questions: existingData.questions || [],
      unlockPassword: password || '',
      mobileHeading: existingData.mobileHeading || '',
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
    console.log(`💾 Unlock password saved to file`);
    
    return { success: true };
  } catch (error) {
    console.error('Error saving password to file:', error);
    return { success: false, error: error.message };
  }
});

// Save mobile heading to file
ipcMain.handle('save-heading', async (event, heading) => {
  // ... existing code ...
});

// Handle app protocol for deep linking (optional)
app.setAsDefaultProtocolClient('offline-ai-assistant');

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});

// ==========================================
// OLLAMA AUTOMATION HANDLERS
// ==========================================

const OLLAMA_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe';

ipcMain.handle('ollama-check', async () => {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    // 1. Try global command
    exec('ollama --version', (error, stdout, stderr) => {
      if (!error) {
        resolve({ installed: true, version: stdout.trim() });
        return;
      }

      // 2. Try default Windows Local AppData path
      if (process.platform === 'win32') {
        const defaultPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe');
        if (fs.existsSync(defaultPath)) {
           resolve({ installed: true, version: 'Detected (Local)' });
           return;
        }
      }

      resolve({ installed: false });
    });
  });
});

// Hologram Status


ipcMain.handle('ollama-install', async () => {
  const { app } = require('electron');
  const path = require('path');
  const fs = require('fs');
  const https = require('https');
  const { spawn } = require('child_process');

  const installerPath = path.join(app.getPath('temp'), 'OllamaSetup.exe');
  
  console.log('⬇️ Downloading Ollama installer...');
  
  // Helper to handle redirects
  const downloadFile = (url, dest, resolve) => {
    https.get(url, (response) => {
      // Handle all redirect codes
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        downloadFile(response.headers.location, dest, resolve);
        return;
      }
      
      if (response.statusCode !== 200) {
        resolve({ success: false, error: `Failed to download: Status ${response.statusCode}` });
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          console.log('✅ Ollama installer downloaded. Running...');
          
          // Run the installer using shell.openPath (safer than spawn)
          const { shell } = require('electron');
          shell.openPath(dest).then((error) => {
             if (error) {
               console.error('❌ Failed to launch installer:', error);
               resolve({ success: false, error: error });
             } else {
               console.log('✅ Installer launched successfully');
               resolve({ success: true, message: 'Installer launched' });
             }
          });
        });
      });
      
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        resolve({ success: false, error: err.message });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      resolve({ success: false, error: err.message });
    });
  };

  return new Promise((resolve) => {
    downloadFile(OLLAMA_INSTALLER_URL, installerPath, resolve);
  });
});

ipcMain.handle('ollama-pull', async (event, modelName) => {
  const { spawn } = require('child_process');
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  return new Promise((resolve) => {
    console.log(`🧠 Pulling model: ${modelName}`);
    
    // Use 'ollama pull' command
    // On Windows, might need to ensure shell is true or path is correct if not in PATH immediately after install
    const pull = spawn('ollama', ['pull', modelName], { shell: true });
    
    pull.stdout.on('data', (data) => {
      const output = data.toString();
      // Ollama output is tricky to parse perfectly for percentage, but usually looks like:
      // "pulling manifest" or "downloading [===>       ] 25%"
      console.log(`[Ollama]: ${output.trim()}`);
      
      if (mainWindow) {
        mainWindow.webContents.send('ollama-progress', {
          status: 'pulling',
          output: output,
          // Rough percentage extraction if possible, otherwise UI handles specific strings
          model: modelName
        });
      }
    });
    
    pull.stderr.on('data', (data) => {
      // Ollama often sends progress to stderr
      const output = data.toString();
      console.log(`[Ollama ERR]: ${output.trim()}`);
      if (mainWindow) {
        mainWindow.webContents.send('ollama-progress', {
          status: 'pulling',
          output: output,
          model: modelName
        });
      }
    });
    
    pull.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Model pulled successfully');
        resolve({ success: true });
      } else {
        console.error(`❌ Model pull failed with code ${code}`);
        resolve({ success: false, error: `Process exited with code ${code}` });
      }
    });
  });
});

ipcMain.handle('ollama-list', async () => {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('ollama list', (error, stdout, stderr) => {
      if (error) {
        resolve([]);
        return;
      }
      // Parse output
      // NAME            ID              SIZE    MODIFIED
      // gemma2:9b       ...             ...     ...
      const lines = stdout.trim().split('\n').slice(1); // skip header
      const models = lines.filter(line => line.trim() !== '').map(line => {
        const parts = line.split(/\s+/);
        return { name: parts[0], size: parts[2] };
      });
      resolve(models);
    });
  });
});


// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (process.argv.includes('--dev')) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});

// Feature Stub: Hologram
ipcMain.handle('get-hologram-status', () => {
  return { available: false, status: 'not_connected' };
});

// Feature: Get Local IP
ipcMain.handle('get-local-ip', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if ('IPv4' !== iface.family || iface.internal) {
        continue;
      }
      return iface.address;
    }
  }
  return '127.0.0.1';
});

// Feature Stub: WiFi Hotspot (Requires Admin/Netsh)
const hotspotManager = require('./hotspot-manager');

ipcMain.handle('get-hotspot-status', () => {
   return { isRunning: hotspotManager.isActive, networkInfo: null };
});

ipcMain.handle('start-hotspot', async (event, { ssid, password }) => {
    try {
      console.log('📶 Requesting Hotspot Start:', ssid);
      return await hotspotManager.startHotspot(ssid, password);
    } catch (error) {
      console.error('Hotspot Error:', error);
      return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-hotspot', async () => {
    return await hotspotManager.stopHotspot();
});

// Bridge: Handle AI Response from Renderer and send to DesktopServer
ipcMain.on('ai-response', (event, { requestId, answer }) => {
    console.log(`📡 [Main] Received AI Response for ID: ${requestId}`);
    if (desktopServer) {
        console.log(`🔄 [Main] Forwarding to Desktop Server...`);
        desktopServer.resolveRequest(requestId, answer);
    } else {
        console.error(`❌ [Main] Desktop Server instance is NULL! Cannot resolve request.`);
    }
});
