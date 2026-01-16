const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Suppress GPU errors (they're harmless but annoying)
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

let launcherWindow;

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Error', `An error occurred: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function createLauncherWindow() {
  try {
    launcherWindow = new BrowserWindow({
      width: 600,
      height: 700,
      minWidth: 500,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
        webSecurity: false
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
      title: 'AI Assistant Launcher',
      resizable: true,
      frame: true,
      show: false,
      backgroundColor: '#667eea'
    });

    // Check if launcher.html exists
    const htmlPath = path.join(__dirname, 'launcher.html');
    if (!fs.existsSync(htmlPath)) {
      dialog.showErrorBox('File Not Found', `launcher.html not found at: ${htmlPath}`);
      app.quit();
      return;
    }

    launcherWindow.loadFile('launcher.html').catch((error) => {
      console.error('Error loading launcher.html:', error);
      dialog.showErrorBox('Load Error', `Failed to load launcher.html: ${error.message}`);
    });

    // Open DevTools for debugging (comment out in production)
    // Uncomment the line below to see console errors
    // launcherWindow.webContents.openDevTools();

    launcherWindow.once('ready-to-show', () => {
      launcherWindow.show();
      console.log('Launcher window shown');
    });

    launcherWindow.on('closed', () => {
      launcherWindow = null;
    });

    // Handle page errors
    launcherWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
      dialog.showErrorBox('Load Error', `Failed to load page: ${errorDescription}`);
    });

    launcherWindow.webContents.on('crashed', () => {
      console.error('Window crashed');
      dialog.showErrorBox('Crash', 'The launcher window crashed. Please try again.');
    });

  } catch (error) {
    console.error('Error creating window:', error);
    dialog.showErrorBox('Error', `Failed to create window: ${error.message}`);
    app.quit();
  }
}

// Disable hardware acceleration to prevent GPU errors (optional)
// Uncomment the line below if GPU errors are annoying
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
  console.log('App ready, creating window...');
  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
}).catch((error) => {
  console.error('Error in whenReady:', error);
  dialog.showErrorBox('Startup Error', `Failed to start app: ${error.message}`);
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Prevent app from quitting immediately
app.on('before-quit', (event) => {
  console.log('App is quitting...');
});

// Keep the process alive even if window closes
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  app.quit();
});

