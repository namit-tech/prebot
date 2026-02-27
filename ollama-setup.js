const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Ollama Setup Module
 * Handles automatic configuration of Ollama for end users
 */

/**
 * Check if OLLAMA_ORIGINS environment variable is set
 */
/**
 * Check if OLLAMA_ORIGINS environment variable is set
 */
/**
 * Check if OLLAMA_ORIGINS environment variable is set
 */
async function checkOllamaSetup(logger, targetModel = null) {
  const log = (msg) => {
      console.log(`[OllamaSetup:Check] ${msg}`);
      if (logger) logger(`[OllamaSetup:Check] ${msg}`);
  };

  try {
    log('Initializing system AI components...');
    
    // Check architecture compatibility (Ollama is 64-bit only)
    const arch = process.arch;
    log(`System Architecture: ${arch}`);
    if (arch === 'ia32') {
      log('❌ ERROR: This PC has a 32-bit (ia32) architecture. Ollama requires a 64-bit Windows system to run.');
      return {
        success: false,
        error: 'Ollama requires a 64-bit processor/operating system. Your PC is 32-bit (ia32).',
        configured: false,
        details: { archCompatible: false }
      };
    }
    const corsConfigured = process.env.OLLAMA_ORIGINS !== undefined;
    log(`CORS Configured: ${corsConfigured} (${process.env.OLLAMA_ORIGINS})`);
    
    // Check if Ollama is running
    const ollamaRunning = await checkOllamaRunning();
    log(`Ollama Running: ${ollamaRunning}`);
    
    // Check if Ollama is installed
    let ollamaInstalled = false;
    
    // 1. Check PATH
    try {
      await execAsync('ollama --version', { timeout: 3000 });
      ollamaInstalled = true;
      log('Ollama found in PATH.');
    } catch (error) {
      log('Ollama NOT found in PATH (might be stale). Checking absolute path...');
    }

    // 2. Check Absolute Path (Fallback)
    if (!ollamaInstalled) {
        const path = require('path');
        const os = require('os');
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
        const fs = require('fs');
        
        if (fs.existsSync(defaultPath)) {
            ollamaInstalled = true;
            log(`Ollama found at absolute path: ${defaultPath}`);
        } else {
            log(`Ollama NOT found at absolute path: ${defaultPath}`);
        }
    }
    
    // Check connection to Ollama API and Models
    let apiAvailable = false;
    let hasModels = false;
    let availableModels = [];

    if (ollamaRunning) {
      const verification = await verifyOllamaConnection(logger);
      apiAvailable = verification.success && verification.connected;
      availableModels = verification.models || [];
      hasModels = availableModels.length > 0;
      log(`API Available: ${apiAvailable}, Models Found: ${hasModels} (${availableModels.length})`);
    } else {
        log('Skipping API check because Ollama is not running.');
    }
    
    // If a target model is specified, we must have it to consider "configured"
    let modelIsReady = hasModels;
    if (targetModel) {
        modelIsReady = availableModels.some(m => m.includes(targetModel));
        log(`Target model check (${targetModel}): ${modelIsReady}`);
    }

    return {
      success: true,
      configured: corsConfigured && ollamaRunning && apiAvailable && modelIsReady,
      details: {
        corsConfigured,
        ollamaInstalled,
        ollamaRunning,
        apiAvailable,
        hasModels,
        availableModels,
        corsValue: process.env.OLLAMA_ORIGINS || null
      }
    };
  } catch (error) {
    console.error('Check setup failed:', error);
    if (logger) logger(`[OllamaSetup:Check] ❌ Failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      configured: false
    };
  }
}

/**
 * Check if Ollama process is running
 */
async function checkOllamaRunning() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq ollama.exe"', { timeout: 3000 });
      return stdout.includes('ollama.exe');
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pgrep -x ollama', { timeout: 3000 });
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await execAsync('pgrep ollama', { timeout: 3000 });
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Internal helper: make HTTP GET request using Node's http module (no fetch needed)
 */
function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const parsed = new URL(url);
    const req = http.get({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Test connection to Ollama API
 */
async function testOllamaConnection() {
  const urls = ['http://127.0.0.1:11434/api/tags', 'http://localhost:11434/api/tags'];
  
  for (const url of urls) {
    try {
      const response = await httpGet(url, 3000);
      if (response.ok) return true;
      console.log(`[Setup:Test] Connection check failed with status: ${response.status}`);
    } catch (error) {
      console.log(`[OllamaSetup:Test] URL ${url} failed: ${error.message} (Code: ${error.code || 'N/A'})`);
    }
  }
  return false;
}

/**
 * Configure Ollama CORS and restart service
 */
async function configureOllama(logger) {
  const log = (msg) => {
      console.log(`[OllamaSetup:Config] ${msg}`);
      if (logger) logger(`[OllamaSetup:Config] ${msg}`);
  };

  try {
    const steps = [];
    
    // Step 1: Set environment variable (user-level, no admin required)
    steps.push({ step: 'Setting CORS environment variable', status: 'running' });
    
    if (process.platform === 'win32') {
      // Windows: Use setx for user-level environment variable
      try {
        await execAsync('setx OLLAMA_ORIGINS "*"');
        // CRITICAL: Update current process environment so children (Ollama) inherit it immediately
        process.env.OLLAMA_ORIGINS = "*";
        steps[0].status = 'success';
        steps[0].message = 'Environment variable set successfully';
      } catch (error) {
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to set environment variable: ' + error.message);
      }
    } else if (process.platform === 'darwin') {
      // macOS: Add to shell profile
      try {
        const homeDir = require('os').homedir();
        const fs = require('fs').promises;
        const profilePath = `${homeDir}/.zshrc`;
        const envLine = '\nexport OLLAMA_ORIGINS="*"\n';
        
        let currentContent = '';
        try {
          currentContent = await fs.readFile(profilePath, 'utf8');
        } catch (e) {
          // File doesn't exist, will create it
        }
        
        if (!currentContent.includes('OLLAMA_ORIGINS')) {
          await fs.appendFile(profilePath, envLine);
        }
        
        steps[0].status = 'success';
        steps[0].message = 'Added to shell profile';
      } catch (error) {
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to configure macOS environment: ' + error.message);
      }
    } else {
      // Linux: Add to .bashrc
      try {
        const homeDir = require('os').homedir();
        const fs = require('fs').promises;
        const profilePath = `${homeDir}/.bashrc`;
        const envLine = '\nexport OLLAMA_ORIGINS="*"\n';
        
        let currentContent = '';
        try {
          currentContent = await fs.readFile(profilePath, 'utf8');
        } catch (e) {
          // File doesn't exist, will create it
        }
        
        if (!currentContent.includes('OLLAMA_ORIGINS')) {
          await fs.appendFile(profilePath, envLine);
        }
        
        steps[0].status = 'success';
        steps[0].message = 'Added to shell profile';
      } catch (error) {
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to configure Linux environment: ' + error.message);
      }
    }
    
    // Step 2: Optimizing service
    steps.push({ step: 'Optimizing AI service', status: 'running' });
    
    try {
      await restartOllama();
      steps[1].status = 'success';
      steps[1].message = 'Ollama restarted successfully';
    } catch (error) {
      steps[1].status = 'warning';
      steps[1].message = 'Please restart Ollama manually or restart your computer';
      log(`Failed to restart Ollama: ${error.message}. Manual restart may be needed.`);
    }
    
    // Step 3: Verify configuration (Single verification to avoid long hangs)
    steps.push({ step: 'Verifying configuration', status: 'running' });
    log('Waiting 3s for Ollama to fully start...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('Verifying final configuration...');
    
    const verification = await verifyOllamaConnection(logger);
    if (verification.success) {
      steps[2].status = 'success';
      steps[2].message = 'Configuration verified and Ollama is responsive';
      log('✅ Configuration verified successfully. Ollama is ready.');
      
      return {
        success: true,
        steps,
        message: 'Ollama configured and verified successfully.',
        requiresAppRestart: true
      };
    } else {
      steps[2].status = 'warning';
      steps[2].message = 'Verification failed. Manual restart may be needed.';
      log(`❌ Verification failed: ${verification.error}. Manual setup or restart required.`);
      
      return {
        success: false,
        steps,
        error: verification.error,
        message: 'Configuration finished but verification failed. Please try a manual restart of Ollama.'
      };
    }
    
  } catch (error) {
    log(`Configuration failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      message: 'Configuration failed. Please try manual setup or contact support.'
    };
  }
}

/**
 * Restart Ollama service
 */
async function restartOllama(logger) {
  const { exec, spawn } = require('child_process');
  
  const log = (msg) => {
      console.log(`[OllamaSetup:Restart] ${msg}`);
      if (logger) logger(`[OllamaSetup:Restart] ${msg}`);
  };

  try {
    log('Restarting Ollama service...');

    if (process.platform === 'win32') {
      // Windows: Kill and restart
      log('Attempting to kill any existing Ollama processes...');
      const processesToKill = ['ollama.exe', 'Ollama.exe', 'ollama app.exe'];
      for (const proc of processesToKill) {
          try {
              await execAsync(`taskkill /F /IM "${proc}"`);
              log(`Process killed: ${proc}`);
          } catch (e) {
              // Not running
          }
      }
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start Ollama - Use absolute path if possible to avoid GUI wrapper
      try {
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
        
        log('Spawning HEADLESS AI service...');
        const spawnEnv = { ...process.env, OLLAMA_ORIGINS: "*", OLLAMA_HOST: "127.0.0.1:11434" };
        
        const cmd = fs.existsSync(defaultPath) ? defaultPath : 'ollama';
        log(`Using executable: ${cmd}`);

        const child = spawn(cmd, ['serve'], {
          detached: true,
          stdio: 'ignore',
          shell: false,
          env: spawnEnv
        });

        child.on('error', (err) => {
             log(`Primary spawn error: ${err.message}`);
             if (cmd !== 'ollama') {
                 log('Falling back to "ollama" in PATH...');
                 const childFallback = spawn('ollama', ['serve'], {
                     detached: true,
                     stdio: 'ignore',
                     shell: false,
                     env: spawnEnv
                 });
                 childFallback.unref();
             }
        });
        child.unref();
        log('Headless service startup initiated.');
        
      } catch (spawnError) {
          log(`Failed to initiate spawn: ${spawnError.message}`);
      }
      
    } else if (process.platform === 'darwin') {
      // macOS: Use launchctl if available, otherwise pkill
      try {
        log('Attempting to kill existing Ollama process (macOS)...');
        await execAsync('pkill ollama');
        log('Ollama process killed (macOS).');
      } catch (e) {
        log('No running Ollama process found to kill (macOS).');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start Ollama in background
      log('Starting Ollama in background (macOS)...');
      exec('nohup ollama serve > /dev/null 2>&1 &', (error) => {
        if (error) log(`Error starting Ollama (macOS): ${error.message}`);
        else log('Ollama started in background (macOS).');
      });
      
    } else {
      // Linux: Similar to macOS
      try {
        log('Attempting to kill existing Ollama process (Linux)...');
        await execAsync('pkill ollama');
        log('Ollama process killed (Linux).');
      } catch (e) {
        log('No running Ollama process found to kill (Linux).');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start Ollama in background
      log('Starting Ollama in background (Linux)...');
      exec('nohup ollama serve > /dev/null 2>&1 &', (error) => {
        if (error) log(`Error starting Ollama (Linux): ${error.message}`);
        else log('Ollama started in background (Linux).');
      });
    }
    
    return { success: true };
  } catch (error) {
    log(`Failed to restart Ollama: ${error.message}`);
    // If global error, rethrow
    throw new Error('Failed to restart Ollama: ' + error.message);
  }
}

/**
 * Verify Ollama connection and model availability
 */
async function verifyOllamaConnection(logger) {
  const log = (msg) => {
      console.log(`[OllamaSetup:Verify] ${msg}`);
      if (logger) logger(`[OllamaSetup:Verify] ${msg}`);
  };

  log('Verifying connection...');
  let attempts = 0;
  const maxAttempts = 5;
  
  while (attempts < maxAttempts) {
    attempts++;
    log(`Attempt ${attempts}/${maxAttempts}...`);
    
    const urls = ['http://127.0.0.1:11434/api/tags', 'http://localhost:11434/api/tags'];
    for (const url of urls) {
      try {
        log(`Trying ${url}...`);
        const response = await httpGet(url, 5000);
        
        if (response.ok) {
          log('Connection Successful!');
          try {
            const data = JSON.parse(response.data);
            const models = data.models || [];
            const modelNames = models.map(m => m.name);
            
            const hasGemma2b = modelNames.some(name => name.includes('gemma2:2b'));
            const hasGemma9b = modelNames.some(name => name.includes('gemma2:9b'));
            const hasAnyGemma = modelNames.some(name => name.includes('gemma'));
            
            return {
              success: true,
              connected: true,
              models: modelNames,
              hasGemma2b,
              hasGemma9b,
              hasAnyGemma,
              recommendedModel: hasGemma2b ? 'gemma2:2b' : (hasGemma9b ? 'gemma2:9b' : null)
            };
          } catch (parseErr) {
            log(`JSON parse error: ${parseErr.message}`);
            return { success: true, connected: true, models: [] };
          }
        }
        log(`Status for ${url}: ${response.status}`);
      } catch (error) {
        log(`Error for ${url}: ${error.message} (Code: ${error.code || 'N/A'})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  log('Connection timed out.');
  return { success: false, error: 'Connection timeout' };
}

/**
 * Install a specific Ollama model
 */
async function installOllamaModel(modelName, logger) {
    const { spawn } = require('child_process');
    
    const log = (msg) => {
        // Strip ANSI escape codes from logs for professional console output
        const cleanMsg = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
        if (!cleanMsg) return;
        console.log(`[OllamaSetup:Model] ${cleanMsg}`);
        if (logger) logger(`[OllamaSetup:Model] ${cleanMsg}`);
    };

    log(`Preparing intelligence data...`);

    // Ensure server is running before pulling
    log('Verifying AI server status...');
    const isRunning = await checkOllamaRunning();
    if (!isRunning) {
        log('AI server not active. Waking it up...');
        await restartOllama(logger);
        await new Promise(r => setTimeout(r, 3000));
    }

    return new Promise((resolve, reject) => {
      const path = require('path');
      const os = require('os');
      const fs = require('fs');
      
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
      
      // Use absolute path if exists, otherwise fallback to "ollama" in PATH
      const cmd = fs.existsSync(defaultPath) ? defaultPath : 'ollama'; 
      log(`Using AI engine at: ${cmd}`);
      
      const spawnEnv = { ...process.env, OLLAMA_ORIGINS: "*", OLLAMA_HOST: "127.0.0.1:11434" };
      const child = spawn(cmd, ['pull', modelName], { env: spawnEnv });
  
      let output = '';
  
      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Parse progress?
        log(text.trim());
        // Emit progress if we had event emitter, but logger is good enough for now
      });
      
      child.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Don't label as ERROR because Ollama often sends progress to stderr
        log(text.trim());
      });
      
      // Set timeout (models can be large - 5.4GB needs time)
      const timeout = setTimeout(() => {
        try {
            log('Model installation timeout - killing process');
            child.kill();
        } catch (e) {
            // Error ignored
        }
        reject(new Error('Model installation timeout (60 minutes reached). Please check your internet connection.'));
      }, 3600000); // 60 minutes

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          log(`Intelligence data active.`);
          resolve({
            success: true,
            message: `Neural Engine updated successfully`,
            output
          });
        } else {
          // Clean output of ANSI codes
           
          const cleanOutput = output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          
          // Check if the output looks like a progress bar (false failure/interrupted)
          // Look for percentages or progress characters like ▕ or █
          const isProgressBar = /%|▕|█|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(cleanOutput);
          
          if (isProgressBar && !cleanOutput.toLowerCase().includes('error')) {
              reject(new Error(`Model download was interrupted. Please try again.`));
          } else {
              const lines = cleanOutput.split('\n').filter(l => l.trim());
              const lastError = lines.slice(-2).join(' ') || 'Unknown error';
              reject(new Error(`Failed to install model: ${lastError}`));
          }
        }
      });
    });

}

/**
 * Install Ollama using bundled installer
 */
/**
 * Install Ollama using bundled installer
 */
async function installOllama(logger) {
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');
  const os = require('os');
  const https = require('https');
  const http = require('http');

  // Helper to log to both console and UI/DevTools
  const log = (msg) => {
      console.log(`[OllamaSetup] ${msg}`);
      if (logger) logger(`[OllamaSetup] ${msg}`);
  };

  // Helper to download a file via https (follows redirects)
  function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          log(`Following redirect to ${response.headers.location}`);
          file.close();
          fs.unlinkSync(destPath);
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err) => { file.close(); reject(err); });
      }).on('error', (err) => { file.close(); reject(err); });
    });
  }

  try {
    // 1. Check for bundled installer first (fallback)
    const appPath = require('electron').app.getAppPath();
    const isPackaged = require('electron').app.isPackaged;
    
    let installerPath;
    let bundledFound = false;

    if (isPackaged) {
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'installers', 'OllamaSetup.exe');
      const resourcePath = path.join(process.resourcesPath, 'resources', 'installers', 'OllamaSetup.exe');
      
      if (fs.existsSync(unpackedPath)) installerPath = unpackedPath;
      else if (fs.existsSync(resourcePath)) installerPath = resourcePath;
    } else {
      installerPath = path.join(__dirname, 'resources', 'installers', 'OllamaSetup.exe');
    }

    if (installerPath && fs.existsSync(installerPath)) {
      log(`Found bundled Ollama installer at: ${installerPath}`);
      bundledFound = true;
    } else {
      log('Bundled installer not found. Attempting to download...');
      
      // 2. Download from Internet to Downloads folder (Permanent)
      const downloadDir = path.join(os.homedir(), 'Downloads');
      installerPath = path.join(downloadDir, 'OllamaSetup.exe');
      const downloadUrl = 'https://ollama.com/download/OllamaSetup.exe';
      
      log(`Downloading from ${downloadUrl} to ${installerPath}...`);
      await downloadFile(downloadUrl, installerPath);
      log('Download complete.');
    }

    log('Activating AI Core...');
    
    return new Promise((resolve, reject) => {
      const silentFlags = ['/VERYSILENT', '/SP-', '/SUPPRESSMSGBOXES', '/NORESTART', '/NOCANCEL', '/TASKS=""'];
      log(`Running installer with advanced silent flags: ${installerPath} ${silentFlags.join(' ')}`);
      
      const child = spawn(installerPath, silentFlags, {
        detached: true,
        stdio: 'ignore'
      });
      
      // Don't unref, we want to wait (but detached allows it to survive if we crash)
      // child.unref(); 

      child.on('error', (err) => {
        log(`❌ Failed to launch installer: ${err.message}`);
        reject(new Error('Failed to launch installer: ' + err.message));
      });

      child.on('close', async (code) => {
        log(`Installer process exited with code ${code}`);
        
        if (code !== 0) {
            log(`⚠️ Installer reported exit code ${code}. Check if it was canceled by user.`);
        }

        // IMMEDIATELY KILL the auto-started Ollama GUI if it exists
        // The installer launches the tray app even with silent flags.
        // We kill it here so we can start a clean headless service in the next step.
        log('Suppressing auto-started Ollama GUI...');
        const killGUI = async () => {
            const guiProcesses = ['ollama.exe', 'Ollama.exe', 'ollama app.exe'];
            for (const pc of guiProcesses) {
                try { await execAsync(`taskkill /F /IM "${pc}"`); } catch (e) {}
            }
        };

        await killGUI();
        // Wait a small bit for OS to release file locks, but no stray background timers!
        await new Promise(r => setTimeout(r, 2000));
        await killGUI();

        // 2. Check if file exists on disk
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');

        log(`Verifying installation at: ${defaultPath}`);

        // Check verification after a longer delay for slower PCs
        log('Waiting 10 seconds for installation to finalize...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        if (fs.existsSync(defaultPath)) {
            log('✅ Verification successful. ollama.exe found.');
            resolve({ 
              success: true, 
              message: 'Installer finished. Verification successful.' 
            });
        } else {
             log(`❌ FAILED: File NOT found at ${defaultPath} after installation.`);
             reject(new Error('Ollama installation could not be verified. Please install manually from https://ollama.com'));
        }
      });
    });

  } catch (error) {
    console.error('❌ Failed to launch installer:', error);
    if (logger) logger(`❌ Failed to launch installer: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

module.exports = {
  checkOllamaSetup,
  configureOllama,
  restartOllama,
  verifyOllamaConnection,
  installOllamaModel,
  installOllama
};
