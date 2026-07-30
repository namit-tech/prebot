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
  // Session verifier supplied by the host (main.js wires this to SecurityManager).
  // Absent it, every gated endpoint denies — these routes sit on an open local
  // port, so they must never fail open.
  const { verifySessionToken, allowDevOrigins = false } = options;

  return new Promise((resolve, reject) => {
    if (server) {
      console.log('Backend already running on port:', serverPort);
      resolve(serverPort);
      return;
    }

    const app = express();

    // This server listens on localhost with no browser origin of its own (the
    // renderer runs from file://), so a page the user has open in Chrome could
    // otherwise call it. Allow only origin-less callers — the app itself, and
    // native/mobile clients — and refuse to hand CORS headers to real web origins.
    app.use(cors({
      origin: (origin, callback) => {
        // Packaged app (file://) and native/mobile callers
        if (!origin || origin === 'null') return callback(null, true);
        // Vite dev server, unpackaged runs only
        if (allowDevOrigins && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      }
    }));
    app.use(express.json());

    /**
     * Gate for anything that exposes user or licence state.
     * The bearer token must be one the main process signed for this machine.
     */
    const requireSession = (req, res, next) => {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;

      let session = null;
      try {
        session = token && typeof verifySessionToken === 'function' ? verifySessionToken(token) : null;
      } catch (e) {
        session = null;
      }

      if (!session) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
      }

      req.session = session;
      next();
    };

    // Simple health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', message: 'PreBot backend running' });
    });

    // NOTE: there is deliberately no local /api/auth/login. Credentials are only
    // ever checked by the licence server, via the main process. A local login
    // endpoint on an open port is exactly what let any password into the app.

    // Reports the session this machine actually holds — no longer a fixed
    // "always valid" answer, and unreachable without the signed token.
    app.get('/api/auth/validate', requireSession, (req, res) => {
      const session = req.session;
      res.json({
        success: true,
        data: {
            user: {
                _id: session.user?.id || session.user?._id || null,
                email: session.email,
                role: session.role,
                companyName: session.user?.companyName || null
            },
            subscription: {
                status: 'active',
                expiryDate: session.expiryDate,
                models: session.models || [],
                aiModel: session.aiModel || null
            }
        }
      });
    });

    // Device identity endpoint (for license validation)
    // /api/device/identity and /api/license/validate were removed: nothing called
    // either, and the licence one handed out every module to any caller.

    // Chat history — user data, so it needs the same session gate.
    let chatHistory = [];

    app.get('/api/chat-history', requireSession, (req, res) => {
      res.json({ success: true, data: chatHistory });
    });

    app.post('/api/chat-history', requireSession, (req, res) => {
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
