const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Ollama Setup Module
 * Handles automatic configuration of Ollama for end users
 */

/**
 * Internal helper to get a fetch function
 */
async function getFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  try {
    const nodeFetch = await import('node-fetch');
    return nodeFetch.default || nodeFetch;
  } catch (e) {
    // Fallback for older environments
    return require('node-fetch');
  }
}

/**
 * Check if OLLAMA_ORIGINS environment variable is set
 */
async function checkOllamaSetup(logger) {
  const log = (msg) => {
    if (logger) logger(`[OllamaSetup:Check] ${msg}`);
    console.log(`[OllamaSetup:Check] ${msg}`);
  };

  try {
    log('Checking Ollama status...');
    // Check architecture compatibility (Ollama is 64-bit only)
    if (process.arch === 'ia32') {
      log('Architectural incompatibility detected: ia32');
      return {
        success: false,
        error: 'Ollama requires a 64-bit processor/operating system. This PC is 32-bit (ia32).',
        configured: false,
        details: { archCompatible: false }
      };
    }
    const corsConfigured = process.env.OLLAMA_ORIGINS !== undefined;
    log(`CORS configured: ${corsConfigured}`);
    
    // Check if Ollama is running
    log('Checking if Ollama is running...');
    const ollamaRunning = await checkOllamaRunning();
    log(`Ollama running: ${ollamaRunning}`);
    
    // Check if Ollama is installed
    log('Checking if Ollama is installed (CLI check)...');
    let ollamaInstalled = false;
    try {
      await execAsync('ollama --version', { timeout: 3000 });
      ollamaInstalled = true;
      log('Ollama CLI found.');
    } catch (error) {
      log('Ollama CLI not found in PATH.');
      ollamaInstalled = false;
    }
    
    // Check connection to Ollama API
    let apiAvailable = false;
    if (ollamaRunning) {
      log('Testing API connection...');
      apiAvailable = await testOllamaConnection();
      log(`API available: ${apiAvailable}`);
    }
    
    return {
      success: true,
      configured: corsConfigured && ollamaRunning && apiAvailable,
      details: {
        corsConfigured,
        ollamaInstalled,
        ollamaRunning,
        apiAvailable,
        corsValue: process.env.OLLAMA_ORIGINS || null
      }
    };
  } catch (error) {
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
 * Test connection to Ollama API
 */
async function testOllamaConnection() {
  const fetchFn = await getFetch();
  const urls = ['http://localhost:11434/api/tags', 'http://127.0.0.1:11434/api/tags'];
  
  for (const url of urls) {
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) return true;
    } catch (error) {
      // Continue to next URL
    }
  }
  return false;
}

/**
 * Configure Ollama CORS and restart service
 */
async function configureOllama(logger) {
  const log = (msg) => {
    if (logger) logger(`[OllamaSetup:Config] ${msg}`);
    console.log(`[OllamaSetup:Config] ${msg}`);
  };

  try {
    log('Starting Ollama configuration...');
    const steps = [];
    
    // Step 1: Set environment variable (user-level, no admin required)
    steps.push({ step: 'Setting CORS environment variable', status: 'running' });
    log('Step 1: Setting OLLAMA_ORIGINS environment variable...');
    
    if (process.platform === 'win32') {
      // Windows: Use setx for user-level environment variable
      try {
        log('Executing setx OLLAMA_ORIGINS "*"');
        await execAsync('setx OLLAMA_ORIGINS "*"');
        // CRITICAL: Update current process environment
        process.env.OLLAMA_ORIGINS = "*";
        steps[0].status = 'success';
        steps[0].message = 'Environment variable set successfully';
        log('Success: OLLAMA_ORIGINS set to *');
      } catch (error) {
        log(`Error: Failed to set environment variable: ${error.message}`);
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to set environment variable: ' + error.message);
      }
    } else if (process.platform === 'darwin') {
      // macOS: Add to shell profile
      try {
        log('Configuring macOS shell profile...');
        const homeDir = require('os').homedir();
        const fs = require('fs').promises;
        const profilePath = `${homeDir}/.zshrc`;
        const envLine = '\nexport OLLAMA_ORIGINS="*"\n';
        
        let currentContent = '';
        try {
          currentContent = await fs.readFile(profilePath, 'utf8');
        } catch (e) {
          log('~/.zshrc not found, will be created.');
        }
        
        if (!currentContent.includes('OLLAMA_ORIGINS')) {
          await fs.appendFile(profilePath, envLine);
          log('Added OLLAMA_ORIGINS to ~/.zshrc');
        } else {
          log('OLLAMA_ORIGINS already exists in ~/.zshrc');
        }
        
        steps[0].status = 'success';
        steps[0].message = 'Added to shell profile';
      } catch (error) {
        log(`Error: macOS config failed: ${error.message}`);
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to configure macOS environment: ' + error.message);
      }
    } else {
      // Linux: Add to .bashrc
      try {
        log('Configuring Linux shell profile...');
        const homeDir = require('os').homedir();
        const fs = require('fs').promises;
        const profilePath = `${homeDir}/.bashrc`;
        const envLine = '\nexport OLLAMA_ORIGINS="*"\n';
        
        let currentContent = '';
        try {
          currentContent = await fs.readFile(profilePath, 'utf8');
        } catch (e) {
          log('~/.bashrc not found, will be created.');
        }
        
        if (!currentContent.includes('OLLAMA_ORIGINS')) {
          await fs.appendFile(profilePath, envLine);
          log('Added OLLAMA_ORIGINS to ~/.bashrc');
        } else {
          log('OLLAMA_ORIGINS already exists in ~/.bashrc');
        }
        
        steps[0].status = 'success';
        steps[0].message = 'Added to shell profile';
      } catch (error) {
        log(`Error: Linux config failed: ${error.message}`);
        steps[0].status = 'failed';
        steps[0].error = error.message;
        throw new Error('Failed to configure Linux environment: ' + error.message);
      }
    }
    
    // Step 2: Restart Ollama service
    steps.push({ step: 'Restarting Ollama service', status: 'running' });
    log('Step 2: Restarting Ollama service...');
    
    try {
      await restartOllama(logger);
      steps[1].status = 'success';
      steps[1].message = 'Ollama restarted successfully';
      log('Success: Ollama service restarted.');
    } catch (error) {
      log(`Warning: Failed to auto-restart service: ${error.message}`);
      steps[1].status = 'warning';
      steps[1].message = 'Please restart Ollama manually or restart your computer';
    }
    
    // Step 3: Verify configuration (Single verification to avoid hangs)
    steps.push({ step: 'Verifying configuration', status: 'running' });
    log('Step 3: Verifying final configuration...');
    
    const verification = await verifyOllamaConnection(logger);
    if (verification.success) {
      log('Verification successful! Ollama is responsive.');
      steps[2].status = 'success';
      steps[2].message = 'Configuration verified and Ollama is responsive';
      
      return {
        success: true,
        steps,
        message: 'Ollama configured and verified successfully.',
        requiresAppRestart: true
      };
    } else {
      log(`Verification failed: ${verification.error}`);
      steps[2].status = 'warning';
      steps[2].message = 'Verification failed. Manual restart may be needed.';
      
      return {
        success: false,
        steps,
        error: verification.error,
        message: 'Configuration finished but verification failed. Please try a manual restart of Ollama.'
      };
    }
    
  } catch (error) {
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
  const log = (msg) => {
    if (logger) logger(`[OllamaSetup:Restart] ${msg}`);
    console.log(`[OllamaSetup:Restart] ${msg}`);
  };

  try {
    log('Restarting Ollama service...');
    if (process.platform === 'win32') {
      // Windows: Kill and restart
      try {
        log('Attempting to kill existing ollama.exe...');
        await execAsync('taskkill /F /IM ollama.exe');
        log('ollama.exe process killed.');
      } catch (e) {
        log('ollama.exe was not running.');
      }
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start Ollama
      // Manually inject OLLAMA_ORIGINS for the child process
      log('Spawning "ollama serve" detached with CORS env.');
      const spawnEnv = { ...process.env, OLLAMA_ORIGINS: "*" };
      const { spawn } = require('child_process');
      const child = spawn('ollama', ['serve'], { 
        detached: true, 
        stdio: 'ignore',
        env: spawnEnv
      });
      child.unref();
      log('Attempted to spawn ollama serve.');
      return { success: true };
      
    } else {
      // macOS/Linux
      try {
        log('Closing existing Ollama process...');
        await execAsync('pkill ollama');
      } catch (e) {}
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      log('Spawning "ollama serve" in background...');
      exec('OLLAMA_ORIGINS="*" nohup ollama serve > /dev/null 2>&1 &', () => {});
    }
    
    return { success: true };
  } catch (error) {
    log(`Restart error: ${error.message}`);
    throw new Error('Failed to restart Ollama: ' + error.message);
  }
}

/**
 * Verify Ollama connection and model availability
 */
async function verifyOllamaConnection(logger) {
  const log = (msg) => {
    if (logger) logger(`[OllamaSetup:Verify] ${msg}`);
    console.log(`[OllamaSetup:Verify] ${msg}`);
  };

  const fetchFn = await getFetch();
  const urls = ['http://localhost:11434/api/tags', 'http://127.0.0.1:11434/api/tags'];
  
  let attempts = 0;
  const maxAttempts = 5;
  log('Starting verification loop...');
  
  while (attempts < maxAttempts) {
    attempts++;
    log(`Attempt ${attempts}/${maxAttempts}...`);
    
    for (const url of urls) {
      try {
        log(`Trying ${url}...`);
        const response = await fetchFn(url, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok) {
          const data = await response.json();
          const models = data.models || [];
          log('Success: Connection established.');
          return {
            success: true,
            connected: true,
            models: models.map(m => m.name)
          };
        }
        log(`Status for ${url}: ${response.status}`);
      } catch (error) {
        log(`Error for ${url}: ${error.message} (Code: ${error.code || 'N/A'})`);
        // Continue
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  log('Verification timeout after multiple attempts.');
  return { success: false, error: 'Connection timeout' };
}

/**
 * Install Ollama using bundled installer
 */
async function installOllama(logger) {
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');
  const os = require('os');
  const { app } = require('electron');

  const log = (msg) => {
      console.log(`[OllamaSetup:Install] ${msg}`);
      if (logger) logger(`[OllamaSetup:Install] ${msg}`);
  };

  try {
    log('Starting Ollama installation...');
    
    // 1. Check for bundled installer first
    let installerPath;
    const isPackaged = app.isPackaged;
    
    if (isPackaged) {
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'installers', 'OllamaSetup.exe');
      const resourcePath = path.join(process.resourcesPath, 'resources', 'installers', 'OllamaSetup.exe');
      
      if (fs.existsSync(unpackedPath)) installerPath = unpackedPath;
      else if (fs.existsSync(resourcePath)) installerPath = resourcePath;
    } else {
      installerPath = path.join(__dirname, '../resources', 'installers', 'OllamaSetup.exe');
    }

    if (installerPath && fs.existsSync(installerPath)) {
      log(`Found bundled installer at: ${installerPath}`);
    } else {
      log('Bundled installer not found. Starting download...');
      
      const downloadDir = path.join(os.homedir(), 'Downloads');
      installerPath = path.join(downloadDir, 'OllamaSetup.exe');
      const downloadUrl = 'https://ollama.com/download/OllamaSetup.exe';
      
      log(`Downloading from ${downloadUrl} to ${installerPath}...`);
      
      const fetchFn = await getFetch();
      const response = await fetchFn(downloadUrl);
      if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
      
      const fileStream = fs.createWriteStream(installerPath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
      });
      
      log('Download complete.');
    }

    log('Launching installer...');
    
    return new Promise((resolve, reject) => {
      const child = spawn(installerPath, [], {
        detached: true,
        stdio: 'ignore'
      });
      
      child.on('error', (err) => {
        log(`Launch failed: ${err.message}`);
        reject(new Error('Failed to launch installer: ' + err.message));
      });

      child.on('close', async (code) => {
        log(`Installer closed with code ${code}`);
        
        // Wait for installation to finish
        log('Waiting 10s for installation to finalize...');
        await new Promise(r => setTimeout(r, 10000));

        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');

        if (fs.existsSync(defaultPath)) {
            log('Verification successful!');
            resolve({ success: true, message: 'Installer finished successfully.' });
        } else {
             log('Verification failed: Binary not found at expected path.');
             reject(new Error('Ollama installation could not be verified.'));
        }
      });
    });

  } catch (error) {
    log(`Installation error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install a specific Ollama model
 */
async function installOllamaModel(modelName) {
  try {
    return new Promise((resolve, reject) => {
      const process = exec(`ollama pull ${modelName}`);
      
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
        // You could emit progress events here
      });
      
      process.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: `Model ${modelName} installed successfully`,
            output
          });
        } else {
          reject(new Error(`Failed to install model: ${output}`));
        }
      });
      
      // Set timeout (models can be large)
      setTimeout(() => {
        process.kill();
        reject(new Error('Model installation timeout'));
      }, 600000); // 10 minutes
    });
  } catch (error) {
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
