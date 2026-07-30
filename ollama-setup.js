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
    
    // Check if Ollama or LM Studio process is running
    const ollamaRunning = await checkOllamaRunning();
    log(`Ollama/LM-Studio Running: ${ollamaRunning}`);

    // Separate LM Studio process detection so the UI can give targeted guidance
    let lmStudioRunning = false;
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq LM Studio.exe"', { timeout: 3000 });
        lmStudioRunning = stdout.toLowerCase().includes('lm studio.exe');
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync('pgrep -x "LM Studio"', { timeout: 3000 });
        lmStudioRunning = stdout.trim().length > 0;
      }
    } catch (e) { /* process not found is fine */ }
    log(`LM Studio Process: ${lmStudioRunning}`);
    
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
        lmStudioRunning,
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
  // First: check by process name
  try {
    if (process.platform === 'win32') {
      let isRunning = false;
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq ollama.exe"', { timeout: 3000 });
        if (stdout.toLowerCase().includes('ollama.exe')) isRunning = true;
      } catch (e) { /* ignore */ }
      
      if (!isRunning) {
        try {
          const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq LM Studio.exe"', { timeout: 3000 });
          if (stdout.toLowerCase().includes('lm studio.exe')) isRunning = true;
        } catch (e) { /* ignore */ }
      }

      if (!isRunning) {
        try {
          const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq ollama app.exe"', { timeout: 3000 });
          if (stdout.toLowerCase().includes('ollama app.exe')) isRunning = true;
        } catch (e) { /* ignore */ }
      }
      
      if (isRunning) return true;
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pgrep -x ollama || pgrep -x "LM Studio"', { timeout: 3000 });
      if (stdout.trim().length > 0) return true;
    } else {
      const { stdout } = await execAsync('pgrep ollama', { timeout: 3000 });
      if (stdout.trim().length > 0) return true;
    }
  } catch (error) {
    // Process list check failed — fall through to API probe
  }

  // Fallback: probe known API ports directly (handles cases where process
  // name doesn't match our filter, e.g. running inside a service wrapper)
  const probePorts = [11434, 11436, 1234];
  for (const port of probePorts) {
    try {
      const resp = await httpGet(`http://127.0.0.1:${port}/`, 1500);
      if (resp.ok || resp.status === 200) return true;
    } catch (e) { /* port not listening */ }
  }

  return false;
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
 * Probe one specific port for a live Ollama ENGINE.
 *
 * Deliberately hits /api/tags rather than / or /api/version: the bridge on 11434
 * answers those itself, so they stay "ok" even when the engine behind it is dead.
 * /api/tags is proxied straight through, so a valid model list proves a real engine.
 */
async function probeOllamaEngine(port, timeoutMs = 2000) {
  try {
    const resp = await httpGet(`http://127.0.0.1:${port}/api/tags`, timeoutMs);
    if (!resp.ok) return false;
    const parsed = JSON.parse(resp.data);
    return Array.isArray(parsed.models);
  } catch (e) {
    return false;
  }
}

/**
 * Poll a port until a real engine answers there.
 *
 * Process-name checks can't do this job: a user's own Ollama tray app makes
 * "ollama.exe is running" true while our port stays dead.
 */
async function waitForOllamaEngine(port, attempts = 10, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    if (await probeOllamaEngine(port)) return true;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Test connection to Ollama API
 */
async function testOllamaConnection() {
  const urls = [
    'http://127.0.0.1:11436/api/tags', 
    'http://localhost:11436/api/tags', 
    'http://127.0.0.1:11434/api/tags',
    'http://127.0.0.1:1234/v1/models' // LM Studio / OpenAI compatible
  ];
  
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
let isRestarting = false;

async function restartOllama(logger, logPath = null) {
  if (isRestarting) {
      console.log('[OllamaSetup:Restart] Restart already in progress, skipping...');
      return { success: true };
  }
  isRestarting = true;
  
  const { exec, spawn } = require('child_process');
  const fs = require('fs');
  
  const log = (msg) => {
      console.log(`[OllamaSetup:Restart] ${msg}`);
      if (logger) logger(`[OllamaSetup:Restart] ${msg}`);
  };

  try {
    log('Restarting Ollama service...');

    if (process.platform === 'win32') {
      // Windows: Kill and restart
      log('Attempting to kill any existing Ollama core engines...');
      const processesToKill = ['ollama.exe', 'Ollama.exe']; // DO NOT kill 'ollama app.exe' here as users use it as their UI
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
        
        const cmd = fs.existsSync(defaultPath) ? defaultPath : 'ollama';
        
        // Start Ollama on port 11436 to leave 11434 open for the bridge
        const spawnEnv = { 
            ...process.env, 
            OLLAMA_ORIGINS: "*", 
            OLLAMA_HOST: "127.0.0.1:11436",
            OLLAMA_DEBUG: "1" // Enable verbose engine logs
        };
        
        log(`Spawning HEADLESS AI service at ${cmd} on port 11436...`);

        // process.cwd() is the install dir (C:\Program Files\...) for an installed build, which a
        // normal user cannot write to — opening the log there threw and killed the spawn before it
        // ever ran. Log to userData instead, and never let a logging failure block the engine.
        let stdio = ['ignore', 'ignore', 'ignore'];
        try {
          let logDir = os.tmpdir();
          try {
            const electron = require('electron');
            if (electron && electron.app && typeof electron.app.getPath === 'function') {
              logDir = electron.app.getPath('userData');
            }
          } catch (e) { /* not running inside Electron — tmpdir is fine */ }

          const logPath = path.join(logDir, 'ollama-engine.log');
          const out = fs.openSync(logPath, 'a');
          stdio = ['ignore', out, out];
          log(`Engine log: ${logPath}`);
        } catch (logErr) {
          log(`Engine log unavailable (${logErr.message}) — starting without it.`);
        }

        const child = spawn(cmd, ['serve'], {
          detached: false, // Keep as child to prevent orphaned processes
          stdio,
          shell: true, // Required for some Windows environments
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
                 childFallback.on('error', (fallbackErr) => {
                     log(`Fallback spawn error: ${fallbackErr.message}`);
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
  } finally {
    isRestarting = false;
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
  
  const checkUrls = [
    { url: 'http://127.0.0.1:11436/api/tags', type: 'ollama' },
    { url: 'http://localhost:11436/api/tags', type: 'ollama' },
    { url: 'http://127.0.0.1:11434/api/tags', type: 'ollama' },
    { url: 'http://127.0.0.1:1234/v1/models', type: 'openai' }
  ];

  log('Verifying connection...');
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    log(`Attempt ${attempts}/${maxAttempts}...`);
    
    for (const { url, type } of checkUrls) {
      try {
        log(`Trying ${url} (${type})...`);
        const response = await httpGet(url, 5000);
        
        if (response.ok) {
          log('Connection Successful!');
          try {
            const data = JSON.parse(response.data);
            let models = [];
            
            if (type === 'ollama') {
              models = (data.models || []).map(m => m.name);
            } else {
              // OpenAI / LM Studio format
              models = (data.data || []).map(m => m.id);
            }
            
            const hasGemma3 = models.some(name => name.toLowerCase().includes('gemma3'));
            const hasGemma2 = models.some(name => name.toLowerCase().includes('gemma2'));
            const hasAnyGemma = models.some(name => name.toLowerCase().includes('gemma'));
            
            return {
              success: true,
              connected: true,
              engineType: type,
              baseUrl: url.replace(type === 'ollama' ? '/api/tags' : '/v1/models', ''),
              models: models,
              hasGemma3,
              hasGemma2,
              hasAnyGemma,
              recommendedModel: hasGemma3 ? 'gemma3:1b' : (hasGemma2 ? 'gemma2:2b' : (models[0] || null))
            };
          } catch (parseErr) {
            log(`JSON parse error: ${parseErr.message}`);
            return { success: true, connected: true, engineType: type, models: [] };
          }
        }
        log(`Status for ${url}: ${response.status}`);
      } catch (error) {
        log(`Error for ${url}: ${error.message} (Code: ${error.code || 'N/A'})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
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

    // Resolve the port we can actually pull against.
    //
    // The pull below pins OLLAMA_HOST, so "some ollama process is alive" (what
    // checkOllamaRunning answers) is not good enough. On a machine where the user
    // already runs the official Ollama tray app, the engine owns 11434 and 11436
    // is dead. The CLI then tries to auto-start a server, its singleton check hits
    // the existing instance ("existing instance found, exiting"), nothing ever binds
    // our port, and the pull dies with "timed out waiting for server to start".
    //
    // Models live in one shared store regardless of which port serves them, so a
    // live engine on the default port is a perfectly good pull target.
    const ENGINE_PORT = 11436;   // our headless engine, behind the bridge
    const DEFAULT_PORT = 11434;  // stock Ollama (a user's own install lands here)

    log('Verifying AI server status...');
    let pullPort = null;

    if (await probeOllamaEngine(ENGINE_PORT)) {
        pullPort = ENGINE_PORT;
    } else if (await probeOllamaEngine(DEFAULT_PORT)) {
        // Don't disturb a working engine just because it isn't on our port.
        log(`Using the AI engine already running on port ${DEFAULT_PORT}.`);
        pullPort = DEFAULT_PORT;
    } else {
        log('AI server not active. Waking it up...');
        await restartOllama(logger);
        // Cold start on a slow disk (or with AV scanning ollama.exe) routinely
        // takes longer than the flat 3s wait this replaced.
        if (await waitForOllamaEngine(ENGINE_PORT, 12, 2000)) {
            pullPort = ENGINE_PORT;
        } else if (await waitForOllamaEngine(DEFAULT_PORT, 3, 2000)) {
            log(`Preferred port unavailable — falling back to port ${DEFAULT_PORT}.`);
            pullPort = DEFAULT_PORT;
        }
    }

    if (!pullPort) {
        throw new Error(
            'The AI engine could not be started, so the model could not be downloaded. ' +
            'If Ollama is already installed on this PC, quit it from the system tray ' +
            '(right-click the Ollama icon → Quit) and try again.'
        );
    }

    log(`AI server ready on port ${pullPort}.`);

    return new Promise((resolve, reject) => {
      const path = require('path');
      const os = require('os');
      const fs = require('fs');
      
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
      
      // Use absolute path if exists, otherwise fallback to "ollama" in PATH
      const cmd = fs.existsSync(defaultPath) ? defaultPath : 'ollama'; 
      log(`Using AI engine at: ${cmd}`);
      
      const spawnEnv = {
        ...process.env,
        OLLAMA_ORIGINS: "*",
        OLLAMA_HOST: `127.0.0.1:${pullPort}` // Verified live above — never a port we only hope is up
      };
      const child = spawn(cmd, ['pull', modelName], { env: spawnEnv });
  
      let output = '';
  
      child.on('error', (err) => {
        log(`Failed to start AI pull process: ${err.message}`);
      });
  
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
          } else if (/existing instance found|timed out waiting for server/i.test(cleanOutput)) {
              // Another Ollama instance owns the engine and blocked ours from starting.
              reject(new Error(
                  'Another copy of Ollama is already running on this PC and blocked the AI engine from starting. ' +
                  'Quit Ollama from the system tray (right-click the Ollama icon → Quit), then try again.'
              ));
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

    // Validate if the installer file is a valid executable (not empty, corrupted, or all zeroes)
    let isValidInstaller = false;
    if (installerPath && fs.existsSync(installerPath)) {
      try {
        const stats = fs.statSync(installerPath);
        if (stats.size > 10 * 1024 * 1024) { // must be larger than 10MB
          const fd = fs.openSync(installerPath, 'r');
          const buffer = Buffer.alloc(2);
          fs.readSync(fd, buffer, 0, 2, 0);
          fs.closeSync(fd);
          // Check for 'MZ' header (0x4D 0x5A)
          if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
            isValidInstaller = true;
          }
        }
      } catch (err) {
        log(`Error validating installer: ${err.message}`);
      }
    }

    if (isValidInstaller) {
      log(`Found bundled Ollama installer at: ${installerPath}`);
      bundledFound = true;
    } else {
      log('Bundled installer not found or is corrupted/invalid. Attempting to download...');
      
      // 2. Download from Internet to Downloads folder (Permanent)
      const downloadDir = path.join(os.homedir(), 'Downloads');
      installerPath = path.join(downloadDir, 'OllamaSetup.exe');
      const downloadUrl = 'https://ollama.com/download/OllamaSetup.exe';
      
      // Check if we already have a valid downloaded installer in Downloads to save bandwidth
      let hasValidDownload = false;
      if (fs.existsSync(installerPath)) {
        try {
          const stats = fs.statSync(installerPath);
          if (stats.size > 10 * 1024 * 1024) {
            const fd = fs.openSync(installerPath, 'r');
            const buffer = Buffer.alloc(2);
            fs.readSync(fd, buffer, 0, 2, 0);
            fs.closeSync(fd);
            if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
              hasValidDownload = true;
            }
          }
        } catch (e) {}
      }

      if (hasValidDownload) {
        log(`Using previously downloaded installer in Downloads folder: ${installerPath}`);
      } else {
        log(`Downloading from ${downloadUrl} to ${installerPath}...`);
        await downloadFile(downloadUrl, installerPath);
        log('Download complete.');
      }
    }

    log('Activating AI Core...');

    // Copy installer to system temp so it is a real local file with no OneDrive
    // cloud-placeholder or Zone Identifier issues that would block UAC elevation.
    const localInstallerPath = path.join(os.tmpdir(), 'OllamaSetup_prebot.exe');
    try {
      log('Staging installer to local temp directory...');
      fs.copyFileSync(installerPath, localInstallerPath);
      installerPath = localInstallerPath;
      log(`Installer staged at: ${installerPath}`);
    } catch (copyErr) {
      log(`Warning: Could not stage installer to temp (${copyErr.message}). Proceeding with original path.`);
    }

    return new Promise((resolve, reject) => {
      // Use PowerShell Start-Process -Verb RunAs so Windows shows the UAC prompt
      // and we properly wait for the installer to finish before verifying.
      // Unblock-File removes the Zone Identifier (Mark of the Web) first.
      const escapedPath = installerPath.replace(/'/g, "''");
      // Use $p.WaitForExit() instead of -Wait parameter, as -Wait waits on the entire process tree
      // (which keeps it blocked forever because the installer launches 'ollama app.exe' at the end).
      const psScript = `try { Unblock-File -Path '${escapedPath}' -ErrorAction SilentlyContinue; $p = Start-Process -FilePath '${escapedPath}' -ArgumentList '/VERYSILENT /SP- /SUPPRESSMSGBOXES /NORESTART /NOCANCEL' -Verb RunAs -PassThru; $p.WaitForExit(); exit $p.ExitCode } catch { exit 1 }`;

      log(`Requesting elevation via PowerShell for: ${installerPath}`);

      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        detached: false,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        log(`❌ Failed to launch installer: ${err.message}`);
        reject(new Error('Failed to launch installer: ' + err.message));
      });

      child.on('close', async (code) => {
        log(`Installer process exited with code ${code}`);

        if (code !== 0) {
            log(`⚠️ Installer reported exit code ${code}. May have been cancelled or permission was denied.`);
        }

        // Give the OS a moment to finish writing files after installer exits.
        await new Promise(r => setTimeout(r, 3000));

        // Verify installation: check known paths first, then fall back to PATH.
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const verificationPaths = [
          path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
        ];

        log('Verifying installation...');
        let ollamaFound = false;
        const foundAtPath = verificationPaths.find(p => fs.existsSync(p));
        if (foundAtPath) {
            log(`✅ Verification successful. ollama.exe found at: ${foundAtPath}`);
            ollamaFound = true;
        }

        // Fallback: ollama may be on PATH even if not at the default location.
        if (!ollamaFound) {
          try {
              await execAsync('ollama --version', { timeout: 5000 });
              log('✅ Verification successful via PATH.');
              ollamaFound = true;
          } catch (e) { /* not in PATH yet */ }
        }

        if (!ollamaFound) {
          const reason = code === 1
              ? 'Setup was cancelled or administrator permission was denied. Please approve the UAC prompt and try again.'
              : 'Ollama installation could not be verified. Please install manually from https://ollama.com';
          log(`❌ FAILED: ${reason}`);
          reject(new Error(reason));
          return;
        }

        // --- Post-install: start a clean headless service ---
        // Kill only the GUI tray app ("ollama app.exe"), leave the core
        // server alone so we can restart it on the correct port.
        log('Suppressing auto-started Ollama GUI tray...');
        try { await execAsync('taskkill /F /IM "ollama app.exe"'); } catch (e) { /* not running */ }

        // Now start the headless service on our preferred port via restartOllama.
        log('Starting headless AI service...');
        try {
          await restartOllama(logger);
          // Wait for the service to actually become responsive
          let apiReady = false;
          for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const resp = await httpGet('http://127.0.0.1:11436/', 2000);
              if (resp.ok || resp.status === 200) { apiReady = true; break; }
            } catch (e) { /* not ready yet */ }
            // Also check default port in case restartOllama used it
            try {
              const resp2 = await httpGet('http://127.0.0.1:11434/', 2000);
              if (resp2.ok || resp2.status === 200) { apiReady = true; break; }
            } catch (e) { /* not ready yet */ }
            log(`Waiting for AI service to start... (${i + 1}/8)`);
          }
          if (apiReady) {
            log('✅ Headless AI service is running and responding.');
          } else {
            log('⚠️ AI service started but API not responding yet. It may still be initializing.');
          }
        } catch (restartErr) {
          log(`⚠️ Could not start headless service: ${restartErr.message}. Will retry on next check.`);
        }

        resolve({ success: true, message: 'Installer finished. Verification successful.' });
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
