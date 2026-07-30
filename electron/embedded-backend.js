const express = require('express');
const cors = require('cors');
const path = require('path');

let server = null;
let serverPort = null;

/**
 * Start embedded Express backend server
 * Returns the port number it's running on
 */
async function startEmbeddedBackend(options = {}) {
  // See the root embedded-backend.js: login must fail closed without a real check.
  const { validateCredentials } = options;

  return new Promise((resolve, reject) => {
    if (server) {
      console.log('Backend already running on port:', serverPort);
      resolve(serverPort);
      return;
    }

    const app = express();
    
    // Middleware
    app.use(cors());
    app.use(express.json());
    
    // Simple health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', message: 'PreBot backend running' });
    });
    
    // Offline authentication endpoint — credentials are still required.
    app.post('/api/auth/login', (req, res) => {
      const { email, password } = req.body || {};

      let allowed = false;
      try {
        allowed = typeof validateCredentials === 'function' && validateCredentials(email, password);
      } catch (e) {
        allowed = false;
      }

      if (!allowed) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      res.json({
        success: true,
        token: 'offline-mode-token',
        user: {
          email: email || 'offline@prebot.local',
          name: 'Offline User',
          role: 'user'
        }
      });
    });
    
    // Device identity endpoint (for license validation)
    app.get('/api/device/identity', (req, res) => {
      const os = require('os');
      res.json({
        success: true,
        deviceId: os.hostname(),
        platform: os.platform()
      });
    });
    
    // Mock license validation endpoint
    app.post('/api/license/validate', (req, res) => {
      // For offline mode, grant all modules
      res.json({
        success: true,
        valid: true,
        modules: ['predefined', 'gemma', 'gemini']
      });
    });
    
    // Start server on dynamic port (5000 or next available)
    const PORT = 5000;
    server = app.listen(PORT, 'localhost', (err) => {
      if (err) {
        console.error('Failed to start backend:', err);
        reject(err);
        return;
      }
      
      serverPort = server.address().port;
      console.log(`✅ Embedded backend running on http://localhost:${serverPort}`);
      resolve(serverPort);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use, try next one
        console.log(`Port ${PORT} in use, backend might already be running`);
        serverPort = PORT;
        resolve(PORT);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Stop the embedded backend server
 */
function stopEmbeddedBackend() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Embedded backend stopped');
        server = null;
        serverPort = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Get the current backend port
 */
function getBackendPort() {
  return serverPort;
}

module.exports = {
  startEmbeddedBackend,
  stopEmbeddedBackend,
  getBackendPort
};
