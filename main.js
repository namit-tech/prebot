const { app, BrowserWindow, Menu, shell, ipcMain, dialog, globalShortcut, session } = require('electron');

// Disable hardware acceleration to fix GPU process crashes on some Windows machines
// This is often needed when running AI models or complex animations alongside Electron
app.disableHardwareAcceleration();

const path = require('path');
const fs = require('fs');
const ollamaSetup = require('./ollama-setup');
const whisperSetup = require('./whisper-setup');
const { startEmbeddedBackend, stopEmbeddedBackend } = require('./embedded-backend');
const SecurityManager = require('./security-manager');
const OllamaBridgeManager = require('./ollama-bridge-manager');

// Keep a global reference of the window object
let mainWindow;
let desktopServer = null;
let pc2Server = null;
let securityManager = null;
let ollamaBridge = null;

// Show startup message in console
console.log('\n');
console.log('========================================');
console.log('🤖 Offline AI Assistant - Starting...');
console.log('========================================');
console.log('📦 Version: 1.0.13');
console.log('🖥️  Platform:', process.platform);
console.log('📁 App Path:', __dirname);
console.log('========================================');
console.log('\n');

// Initialize specialized setup handlers
whisperSetup.initIPC();

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
    if (!fs.existsSync(appAssetsPath)) return;

    const userAssetsPath = path.join(userDataPath, 'assets');
    if (!fs.existsSync(userAssetsPath)) {
      fs.mkdirSync(userAssetsPath, { recursive: true });
    }

    // Function to recursively copy a directory
    const copyDirRecursive = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath);
        } else {
          // Robust Copy: Only copy if missing or if it's an executable we need to update
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
    };

    // 1. Copy Videos
    const appVideosPath = path.join(appAssetsPath, 'videos');
    const userVideosPath = path.join(userAssetsPath, 'videos');
    if (fs.existsSync(appVideosPath)) {
      const videoFiles = fs.readdirSync(appVideosPath).filter(file => 
        file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mov')
      );
      
      if (!fs.existsSync(userVideosPath)) {
        fs.mkdirSync(userVideosPath, { recursive: true });
      }

      videoFiles.forEach(videoFile => {
        const srcPath = path.join(appVideosPath, videoFile);
        const destPath = path.join(userVideosPath, videoFile);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`📹 Copied video: ${videoFile}`);
        }
      });
    }

    // 2. Copy Whisper STT Cluster (Crucial for Packaged Builds)
    const appWhisperPath = path.join(appAssetsPath, 'whisper');
    const userWhisperPath = path.join(userAssetsPath, 'whisper');
    
    // Check for a specific key file to verify installation
    const whisperStreamExe = path.join(userWhisperPath, 'Release', 'whisper-stream.exe');
    const whisperStreamExeAlt = path.join(userWhisperPath, 'whisper-stream.exe');

    if (fs.existsSync(appWhisperPath) && (!fs.existsSync(whisperStreamExe) && !fs.existsSync(whisperStreamExeAlt))) {
      console.log('🎙️ Deploying Neural STT Engine to user data directory...');
      copyDirRecursive(appWhisperPath, userWhisperPath);
      console.log('✅ Neural STT Engine deployed');
    }

    // 3. Copy Icon
    const iconExtensions = ['ico', 'png', 'icns'];
    for (const ext of iconExtensions) {
      const iconPath = path.join(appAssetsPath, `icon.${ext}`);
      if (fs.existsSync(iconPath)) {
        const destIconPath = path.join(userAssetsPath, `icon.${ext}`);
        if (!fs.existsSync(destIconPath)) {
          fs.copyFileSync(iconPath, destIconPath);
        }
        break;
      }
    }

    console.log('✅ Asset verification complete');
  } catch (error) {
    console.warn('⚠️ Asset setup warning:', error.message);
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
      titleBarStyle: 'default',
      autoHideMenuBar: true
    });
    global.mainWindow = mainWindow;

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
    if (!app.isPackaged && process.argv.includes('--dev-server')) {
      // ONLY load from URL if user explicitly asks for dev-server mode
      mainWindow.loadURL('http://localhost:5173').then(() => {
        console.log('✅ Connected to Vite dev server (port 5173)');
      }).catch(() => {
        console.warn('⚠️ Vite dev server not found on 5173, falling back to local index.html');
        mainWindow.loadFile(indexPath);
      });
    } else {
      // Default: Load the local index.html (works for both production and manual local testing)
      mainWindow.loadFile(indexPath).then(() => {
        console.log('✅ index.html loaded successfully');
      }).catch((error) => {
        console.error('❌ Error loading index.html:', error);
        dialog.showErrorBox('Load Error', `Failed to load application: ${error.message}`);
      });
    }

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      
      // Focus on the window
      if (process.platform === 'darwin') {
        app.dock.show();
      }

      // Register secret shortcut to toggle DevTools (Ctrl+Shift+I)
      globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (mainWindow && mainWindow.isFocused()) {
          mainWindow.webContents.toggleDevTools();
        }
      });
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

    // CRITICAL: Block navigation to root drive (Fixes ERR_FILE_NOT_FOUND: file:///C:/)
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url === 'file:///' || url === 'file:///C:/') {
        console.warn('⛔ [Main] Blocked invalid navigation to root drive:', url);
        event.preventDefault();
      } else {
        console.log('🔗 [Main] Window navigating to:', url);
      }
    });

    mainWindow.webContents.on('will-frame-navigate', (event) => {
       const url = event.url;
       if (url === 'file:///' || url === 'file:///C:/') {
         console.warn('⛔ [Main] Blocked invalid frame navigation to root drive:', url);
         event.preventDefault();
       }
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


// Allow WebSpeech API (used by Cloud AI Brain mode) to connect to Google's STT servers.
// Without this, Electron's file:// context blocks the WebSocket that Chrome's built-in
// speech recognition uses, resulting in an immediate 'network' error.
app.commandLine.appendSwitch('enable-speech-input');
app.commandLine.appendSwitch('disable-web-security'); // already set per-window; belt-and-suspenders here

// Enable SharedArrayBuffer for Silero VAD (ONNX runtime needs it)
app.on('ready', () => {
  // Grant microphone + speech permission automatically — needed for WebSpeech API in file:// context.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'speech', 'microphone', 'camera'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'mainFrame') {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Cross-Origin-Opener-Policy': ['same-origin'],
          'Cross-Origin-Embedder-Policy': ['credentialless'],
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
});

// Initialize Security and Bridge
app.whenReady().then(async () => {
    const userDataPath = app.getPath('userData');
    securityManager = new SecurityManager(userDataPath);

    // Drain anything recorded during a previous run (e.g. an event held offline).
    startInteractionSync();

    // There is one edition now, and the local Ollama bridge is core to it, so it
    // always starts rather than being gated on a build flag.
    const shouldStartBridge = true;

    if (shouldStartBridge) {
        try {
            // SIMPLE & STRAIGHT: Forcefully clear port 11434 specifically
            console.log('🛡️ [Main] Initializing specialized bridge territory...');
            try {
                const { execSync } = require('child_process');
                console.log('[Main] Clearing port 11434 (Universal Kill)...');
                // We MUST kill the GUI app too, otherwise it will just restart the engine 0.1s later
                execSync('taskkill /F /IM ollama.exe /T', { stdio: 'ignore' });
                execSync('taskkill /F /IM "ollama app.exe" /T', { stdio: 'ignore' });
                execSync('taskkill /F /IM "Ollama.exe" /T', { stdio: 'ignore' });
            } catch (e) { /* ignore if not running */ }

            // Increased OS cooldown to be extra safe
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Re-spawn headless engine on 11436
            await ollamaSetup.restartOllama();
            
            ollamaBridge = new OllamaBridgeManager({ 
                port: 11434, // standard port
                targetPort: 11436, // engine port
                prebotUrl: 'http://localhost:5000/api/bridge-response' 
            });

            // Wire up bridge events to UI using the reliable singleton mainWindow
            ollamaBridge.on('thinking', () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('external-ai-thinking');
                    console.log('[Main] 🧠 Bridge Thinking -> UI via mainWindow');
                } else {
                    console.warn('[Main] ⚠️ Thinking detected but mainWindow not available');
                }
            });

            ollamaBridge.on('response', (data) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('external-ai-response', data);
                    console.log('[Main] ✅ Bridge Response -> UI via mainWindow');
                } else {
                    console.warn('[Main] ⚠️ Response captured but mainWindow not available');
                }
            });

            // Local bridge diagnostic listener to verify emission
            ollamaBridge.on('thinking', () => console.log('[Main] Bridge Thinking event absorbed'));
            ollamaBridge.on('response', (data) => console.log('[Main] Bridge Response event absorbed (size:', data?.answer?.length, ')'));

            await ollamaBridge.start();
            console.log(`[Main] Internal Ollama Bridge started (${app.isPackaged ? 'Special Edition' : 'Developer Mode'}).`);
            console.log('🛡️ [Main] Bridge listening on default port 11434.');
        } catch (bridgeError) {
            console.error('[Main] Bridge startup error:', bridgeError.message);
        }
    }
});

// --- Authentication -------------------------------------------------------
//
// Login runs HERE, not in the renderer. If the renderer performed the login and
// handed the result over, anyone with DevTools could call the save IPC with a
// role of their choosing. Main talks to the licence server itself and is the only
// thing that can mint a session, so the renderer holds nothing worth forging.

const REMOTE_API_URL = process.env.PREBOT_API_URL || 'https://adminapi.elloindia.in/api';
const OFFLINE_GRACE_DAYS = 30; // how long a cached session survives with no expiry from the server

function postJson(url, body, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const http = require('http');
        const parsed = new URL(url);
        const payload = JSON.stringify(body);
        const transport = parsed.protocol === 'https:' ? https : http;

        const req = transport.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (e) { /* non-JSON error page */ }
                resolve({ status: res.statusCode, json, raw: data });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(payload);
        req.end();
    });
}

// IPC: Login against the licence server, then mint a local signed session
ipcMain.handle('auth:login', async (event, { email, password }) => {
    try {
        if (!securityManager) return { success: false, error: 'Security subsystem not ready' };

        const hardwareId = securityManager.getMachineID();
        console.log(`[Auth] Login attempt for ${email}`);

        let response;
        try {
            response = await postJson(`${REMOTE_API_URL}/auth/login`, { email, password, hardwareId });
        } catch (netErr) {
            console.warn('[Auth] Licence server unreachable:', netErr.message);
            return {
                success: false,
                offline: true,
                error: 'Cannot reach the licence server. An internet connection is required to sign in.'
            };
        }

        if (response.status !== 200 || !response.json?.success) {
            const serverMsg = response.json?.error || response.json?.message;
            console.log(`[Auth] Rejected (${response.status}) for ${email}`);
            return { success: false, error: serverMsg || 'Invalid email or password' };
        }

        const data = response.json.data || {};
        const fallbackExpiry = new Date(Date.now() + OFFLINE_GRACE_DAYS * 86400000).toISOString();

        const session = {
            email: data.user?.email || email,
            role: data.user?.role || 'user',
            models: data.models || data.user?.subscription?.models || [],
            expiryDate: data.expiryDate || fallbackExpiry,
            serverToken: data.token || null,
            licenseToken: data.licenseToken || null,
            aiModel: data.user?.subscription?.aiModel || null,
            user: data.user || { email, role: data.user?.role || 'user' }
        };

        const token = securityManager.saveSession(session);
        console.log(`[Auth] Session issued for ${session.email} (role: ${session.role})`);

        return { success: true, session, token };
    } catch (error) {
        console.error('[Auth] Login failed:', error.message);
        return { success: false, error: error.message };
    }
});

// IPC: Restore a previously issued session (this is what makes offline use work)
ipcMain.handle('auth:get-session', async () => {
    if (!securityManager) return { success: false, error: 'Security subsystem not ready' };

    const stored = securityManager.getSession();
    if (!stored) return { success: false, error: 'No valid session' };

    return { success: true, session: stored.session, token: stored.token };
});

// IPC: Logout — drop the stored session
ipcMain.handle('auth:logout', async () => {
    if (securityManager) securityManager.clearSession();
    return { success: true };
});

// IPC: Get Machine ID for key generation
ipcMain.handle('get-machine-id', async () => {
    console.log('📡 [IPC] get-machine-id');
    return securityManager.getMachineID();
});

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

ipcMain.handle('set-active-module', async (event, moduleId) => {
  if (desktopServer) {
    desktopServer.setActiveModule(moduleId);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('set-mobile-presets-enabled', async (event, enabled) => {
  if (desktopServer) {
    desktopServer.setMobilePresetsEnabled(enabled);
    return { success: true };
  }
  return { success: false };
});

// Piper TTS Handler
const piperHandler = require('./piper-handler');
const whisperHandler = require('./whisper-handler');
const os = require('os');
const crypto = require('crypto');

// --- Per-tenant analytics & API metering ------------------------------------
const InteractionStore = require('./interaction-store');
const InteractionSync = require('./interaction-sync');
let interactionStore = null;
let interactionSync = null;

const getInteractionStore = () => {
  if (!interactionStore) interactionStore = new InteractionStore(app.getPath('userData'));
  return interactionStore;
};

/**
 * Start the background uploader. Safe to call repeatedly.
 * The licence server base URL mirrors api.service.js on the renderer side.
 */
const startInteractionSync = () => {
  if (interactionSync) return;
  interactionSync = new InteractionSync({
    store: getInteractionStore(),
    getAuth: () => {
      const stored = securityManager?.getSession();
      if (!stored?.session?.serverToken) return null;
      return {
        apiBase: process.env.PREBOT_API_URL || 'https://adminapi.elloindia.in/api',
        serverToken: stored.session.serverToken,
      };
    },
  });
  interactionSync.start();
};

/**
 * Tenant identity for a record, read from the *stored, verified* session.
 * Deliberately not taken from the renderer: a client machine must not be able to
 * write records attributed to a different tenant.
 * Returns null when unlicensed — nothing is recorded in that state.
 */
const getTenantContext = () => {
  // Assigned during app init; a record arriving before that is simply not attributable.
  if (!securityManager) return null;
  const stored = securityManager.getSession();
  if (!stored?.session) return null;
  const s = stored.session;
  return {
    tenantId: s.user?._id || s.user?.id || null,
    tenantEmail: s.email || null,
    companyName: s.user?.companyName || null,
    role: s.role || 'user',
    deviceId: securityManager.getMachineID(),
    appVersion: app.getVersion(),
  };
};

// IPC: Record one answered question (usage patterns).
ipcMain.handle('record-interaction', async (event, payload = {}) => {
  const tenant = getTenantContext();
  if (!tenant) return { success: false, error: 'No active session' };
  const rec = getInteractionStore().append({
    type: 'interaction',
    ...tenant,
    question: String(payload.question || '').slice(0, 2000),
    answer: String(payload.answer || '').slice(0, 4000),
    module: payload.module || null,
    inputType: payload.inputType || null,
    latencyMs: Number(payload.latencyMs) || null,
  });
  return { success: !!rec };
});

// IPC: Record a finished Gemini Live session (minutes + tokens, for cost attribution).
ipcMain.handle('record-usage', async (event, payload = {}) => {
  const tenant = getTenantContext();
  if (!tenant) return { success: false, error: 'No active session' };
  const rec = getInteractionStore().append({
    type: 'usage',
    ...tenant,
    provider: 'gemini-live',
    ...payload,
  });
  if (rec) {
    console.log(`[Usage] ${tenant.companyName || tenant.tenantEmail}: ${rec.connectedMinutes}min on ${rec.model}`);
  }
  return { success: !!rec };
});

// IPC: Read analytics. Superadmin only — this is cross-tenant business data, and a
// client's own machine has no reason to expose it.
ipcMain.handle('get-usage-analytics', async (event, { since } = {}) => {
  const tenant = getTenantContext();
  if (!tenant) return { success: false, error: 'No active session' };
  if (tenant.role !== 'superadmin') {
    return { success: false, error: 'Not authorized' };
  }
  const store = getInteractionStore();
  return {
    success: true,
    tenant,
    stats: store.stats(),
    usage: store.usageSummary({ since }),
  };
});

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

// --- Streaming Piper TTS ----------------------------------------------------
// Raw PCM is pushed to the renderer as Piper produces it, so playback starts on the
// first chunk instead of after a full WAV is written. Cancellable mid-sentence,
// which is what lets the user interrupt the assistant.
const activePiperStreams = new Map();

// IPC: Start a streaming synthesis. Chunks arrive on 'piper-stream-chunk'.
ipcMain.handle('piper-stream-start', async (event, { text, voice, streamId }) => {
    try {
        if (!text || !streamId) return { success: false, error: 'text and streamId are required' };

        // Only one spoken response at a time — a new one supersedes whatever is playing.
        for (const [id, handle] of activePiperStreams) {
            handle.cancel();
            activePiperStreams.delete(id);
        }

        const sender = event.sender;
        const send = (channel, payload) => {
            if (!sender.isDestroyed()) sender.send(channel, payload);
        };

        const handle = piperHandler.streamSpeech(text, voice, {
            onChunk: (chunk) => send('piper-stream-chunk', { streamId, chunk }),
            onEnd: () => {
                activePiperStreams.delete(streamId);
                send('piper-stream-end', { streamId });
            },
            onError: (err) => {
                activePiperStreams.delete(streamId);
                console.error('[IPC] piper-stream failed:', err.message);
                send('piper-stream-error', { streamId, error: err.message });
            },
        });

        activePiperStreams.set(streamId, handle);
        return { success: true, streamId, sampleRate: piperHandler.getSampleRate(voice) };
    } catch (error) {
        console.error('[IPC] piper-stream-start failed:', error);
        return { success: false, error: error.message };
    }
});

// IPC: Cancel an in-flight synthesis (barge-in).
ipcMain.handle('piper-stream-cancel', async (event, { streamId }) => {
    const handle = activePiperStreams.get(streamId);
    if (handle) {
        handle.cancel();
        activePiperStreams.delete(streamId);
        return { success: true };
    }
    return { success: false };
});

// IPC: Batch Transcribe Audio (Record → Save → Transcribe)
ipcMain.handle('transcribe-audio', async (event, { audioBuffer, language }) => {
    const tempDir = path.join(app.getPath('userData'), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const wavPath = path.join(tempDir, `recording-${Date.now()}.wav`);
    
    try {
        // Write the raw audio buffer from renderer to a WAV file
        const buffer = Buffer.from(audioBuffer);
        fs.writeFileSync(wavPath, buffer);
        console.log(`[Main] Saved recording: ${wavPath} (${buffer.length} bytes)`);
        
        // Run batch transcription (high accuracy, no real-time pressure)
        const result = await whisperHandler.transcribeFile(wavPath, language || 'en');
        return result;
    } catch (error) {
        console.error('[Main] Transcription error:', error);
        // Clean up temp file on error
        try { fs.unlinkSync(wavPath); } catch (e) { /* ignore */ }
        return { success: false, error: error.message };
    }
});

// Legacy start/stop kept for compatibility (no-ops now)
ipcMain.handle('start-stt', async () => ({ success: true }));
ipcMain.handle('stop-stt', async () => ({ success: true }));

// Bridge whisper diagnostic events to renderer
whisperHandler.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt-status', status);
  }
});

whisperHandler.on('diag', (msg) => {
  console.log(`[STT-DIAG] ${msg}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt-diag', msg);
  }
});

whisperHandler.on('error', (error) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt-error', error);
  }
});

// IPC: Get System Specifications for Performance Monitoring
ipcMain.handle('get-system-specs', async () => {
    try {
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown Processor';
        const coreCount = cpus.length;
        const totalRAM = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // Convert to GB
        const platform = os.platform();
        const arch = os.arch();

        return {
            success: true,
            specs: {
                cpuModel,
                coreCount,
                totalRAM,
                platform,
                arch
            }
        };
    } catch (error) {
        console.error('[Main] Error fetching system specs:', error);
        return { success: false, error: error.message };
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
        console.log('🌐 Triggering PC2 Browser Display with dynamic video...');
        pc2Server.startAnimation(video);
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
app.whenReady().then(async () => {
  try {
    console.log('✅ Electron app is ready, creating window...');
    createWindow();
    createMenu();

    // Auto-start Embedded Backend
    console.log('🚀 Starting embedded backend...');
    try {
        // Resolved per-request, so it stays correct regardless of which
        // whenReady block finishes constructing securityManager first.
        const port = await startEmbeddedBackend({
            verifySessionToken: (token) =>
                securityManager ? securityManager.verifySessionToken(token) : null,
            allowDevOrigins: !app.isPackaged // Vite dev server runs on another origin
        });
        console.log(`✅ Embedded backend ready on port ${port}`);
    } catch (err) {
        console.error('❌ Failed to start embedded backend:', err);
    }

    // Pre-warm Whisper server so the model is loaded in RAM before the first question.
    // Runs in background — app startup is not blocked.
    whisperHandler.ensureServerRunning().then(ready => {
        console.log(ready
            ? '✅ Whisper server warm — first transcription will be fast'
            : '⚠️  Whisper server unavailable — will use CLI fallback');
    });

    // [CLEANUP] Redundant auto-start removed.
    // Ollama is handled in the Bridge-Sync block above to ensure correct port release.

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

app.on('before-quit', async (event) => {
  console.log('🛑 App closing, cleaning up servers...');
  
  if (desktopServer) {
    try {
      desktopServer.stop();
      desktopServer = null;
      console.log('✅ Desktop server stopped');
    } catch (e) {
      console.error('Error stopping desktop server:', e);
    }
  }

  if (pc2Server) {
    try {
      pc2Server.stop();
      pc2Server = null;
      console.log('✅ PC2 server stopped');
    } catch (e) {
      console.error('Error stopping PC2 server:', e);
    }
  }

  // Stop whisper-server background process
  whisperHandler.stopServer();

  // Force kill any lingering VLC processes (Windows)
  if (process.platform === 'win32') {
    try {
        require('child_process').execSync('taskkill /F /IM vlc.exe /T >nul 2>&1');
    } catch (e) { /* ignore */ }
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
  Menu.setApplicationMenu(null);
}

// IPC handlers for communication with renderer process
ipcMain.handle('get-app-version', () => {
  console.log('📡 [IPC] get-app-version');
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  console.log('📡 [IPC] get-app-path');
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
    // Block root drive navigation
    if (navigationUrl === 'file:///' || navigationUrl === 'file:///C:/' || navigationUrl === 'file:///C:/' || navigationUrl.endsWith(':/') || navigationUrl.endsWith(':/')) {
      console.warn('⛔ [Main:Security] Blocked invalid navigation to root drive:', navigationUrl);
      event.preventDefault();
      return;
    }

    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    } else {
      console.log('🔗 [Main:Security] Internal navigation allowed:', navigationUrl);
    }
  });
});

// ==========================================
// OLLAMA AUTOMATION HANDLERS
// ==========================================

// Redundant legacy handlers removed in favor of ollamaSetup module

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

// Ollama Setup Automation - IPC Handlers

ipcMain.handle('ollama:check-setup', async (event, targetModel = null) => {
  console.log('[Main:IPC] ollama:check-setup invoked, target:', targetModel);
  const logger = (msg) => {
    console.log(msg);
    try { event.sender && event.sender.send('ollama-log', msg); } catch(e) {}
    try { mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('ollama-log', msg); } catch(e) {}
  };
  const result = await ollamaSetup.checkOllamaSetup(logger, targetModel);
  console.log('[Main:IPC] ollama:check-setup result:', JSON.stringify(result));
  return result;
});

ipcMain.handle('ollama:configure', async (event) => {
  console.log('[Main:IPC] ollama:configure invoked');
  const logger = (msg) => {
    console.log(msg);
    try { event.sender && event.sender.send('ollama-log', msg); } catch(e) {}
    try { mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('ollama-log', msg); } catch(e) {}
  };
  const result = await ollamaSetup.configureOllama(logger);
  console.log('[Main:IPC] ollama:configure result:', JSON.stringify(result));
  return result;
});

ipcMain.handle('ollama:verify', async (event) => {
  console.log('[Main:IPC] ollama:verify invoked');
  const logger = (msg) => {
    console.log(msg);
    try { event.sender && event.sender.send('ollama-log', msg); } catch(e) {}
    try { mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('ollama-log', msg); } catch(e) {}
  };
  const result = await ollamaSetup.verifyOllamaConnection(logger);
  console.log('[Main:IPC] ollama:verify result:', JSON.stringify(result));
  return result;
});

// IPC: Get Ollama Logs
ipcMain.handle('get-ollama-logs', async () => {
    try {
        const logPath = path.join(getDataDirectory().dataDir, 'ollama-service.log');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            // Return last 2000 characters
            return content.slice(-2000);
        }
        return "Log file not found.";
    } catch (error) {
        return `Error reading logs: ${error.message}`;
    }
});

// IPC: Check Bridge Status
ipcMain.handle('check-bridge-status', async () => {
    const http = require('http');
    
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
            resolve({ 
                running: true, 
                status: res.statusCode,
                msg: "Bridge is responding"
            });
        });
        req.on('error', (err) => {
            resolve({ 
                running: false, 
                error: err.message,
                msg: "Bridge not responding"
            });
        });
        req.setTimeout(2000, () => {
            req.destroy();
            resolve({ running: false, error: 'Timeout', msg: "Bridge timeout" });
        });
    });
});

ipcMain.handle('ollama:install-model', async (event, modelName) => {
  console.log('[Main:IPC] ollama:install-model invoked for', modelName);
  const logger = (msg) => {
    console.log(msg);
    try { event.sender && event.sender.send('ollama-log', msg); } catch(e) {}
    try { mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('ollama-log', msg); } catch(e) {}
  };
  return await ollamaSetup.installOllamaModel(modelName, logger);
});

ipcMain.handle('ollama:install', async (event) => {
  console.log('[Main:IPC] ollama:install invoked');
  const logger = (message) => {
    console.log(message);
    try { event.sender && event.sender.send('ollama-log', message); } catch(e) {}
    try { mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('ollama-log', message); } catch(e) {}
  };
  return await ollamaSetup.installOllama(logger);
});


// Bridge: Handle AI Response from Renderer and send to DesktopServer
ipcMain.on('ai-response', (event, responseData) => {
    const { requestId, answer } = responseData;
    console.log(`📡 [Main] Received AI Response for ID: ${requestId}`);
    if (desktopServer) {
        console.log(`🔄 [Main] Forwarding to Desktop Server...`);
        desktopServer.resolveRequest(requestId, responseData);
    } else {
        console.error(`❌ [Main] Desktop Server instance is NULL! Cannot resolve request.`);
    }
});
