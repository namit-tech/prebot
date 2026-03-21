const express = require('express');
const cors = require('cors');
const path = require('path');

let server = null;
let serverPort = null;

/**
 * Start embedded Express backend server
 * Returns the port number it's running on
 */
async function startEmbeddedBackend() {
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
    
    // Mock authentication endpoint for offline mode
    app.post('/api/auth/login', (req, res) => {
      // For offline mode, always succeed
      const { email } = req.body;
      
      res.json({
        success: true,
        data: {
            token: 'offline-mode-token',
            licenseToken: 'offline-license-token',
            expiryDate: '2099-12-31T23:59:59Z',
            models: ['predefined', 'gemma', 'gemini'],
            user: {
                id: 'offline-user-id',
                email: email || 'offline@prebot.local',
                name: 'Offline User',
                role: 'special-edition',
                companyName: 'PreBot Offline'
            }
        }
      });
    });

    // Mock validation endpoint
    app.get('/api/auth/validate', (req, res) => {
      res.json({
        success: true,
        data: {
            user: {
                _id: 'offline-user-id',
                email: 'offline@prebot.local',
                role: 'special-edition',
                companyName: 'PreBot Offline'
            },
            subscription: {
                status: 'active',
                expiryDate: '2099-12-31T23:59:59Z',
                models: ['predefined', 'gemma', 'gemini'],
                aiModel: 'gemma2:2b'
            }
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
    
    // Mock chat history storage
    let chatHistory = [];
    
    // Mock chat history endpoint
    app.get('/api/chat-history', (req, res) => {
      res.json({ success: true, data: chatHistory });
    });
    
    app.post('/api/chat-history', (req, res) => {
      const message = req.body;
      chatHistory.push({
        ...message,
        id: Date.now() + Math.random(),
        timestamp: message.timestamp || Date.now()
      });
      
      // Keep only last 100 messages to prevent memory leak
      if (chatHistory.length > 100) chatHistory = chatHistory.slice(-100);
      
      res.json({ success: true });
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
