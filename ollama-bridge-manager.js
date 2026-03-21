const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const EventEmitter = require('events');

class OllamaBridgeManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port || 11434; // standard Ollama port
        this.targetPort = options.targetPort || 11436; // internal port for Ollama engine
        
        console.log(`[Bridge:Audit] Initializing with:`);
        console.log(`  - Local: http://127.0.0.1:${this.port}`);
        console.log(`  - Engine: http://127.0.0.1:${this.targetPort}`);
        console.log(`  - OLLAMA_HOST (Process): ${process.env.OLLAMA_HOST || 'Default (11434)'}`);
        console.log(`  - OLLAMA_ORIGINS (Process): ${process.env.OLLAMA_ORIGINS || 'Not Set'}`);

        this.app = express();
        this.server = null;
        this.setupBridge();
    }

    setupBridge() {
        this.app.use(cors());

        // Log all incoming requests for debugging
        this.app.use((req, res, next) => {
            const url = req.url || '';
            const isAIPath = url.includes('/api/chat') || url.includes('/api/generate');
            console.log(`[Bridge] ${req.method} request: ${url} (AI Path: ${isAIPath})`);
            
            if (isAIPath) {
                console.log(`[Bridge] 🧠 AI activity detected. Emitting thinking event...`);
                this.emit('thinking');
            }
            next();
        });

        // 0. Instant Version Check (Breaks the infinite loading loop)
        this.app.get('/api/version', (req, res) => {
            res.json({ version: "0.5.11" });
        });

        // 1. UNIVERSAL TRANSPARENT PROXY
        this.app.use('/', createProxyMiddleware({
            target: `http://127.0.0.1:${this.targetPort}`,
            changeOrigin: true,
            secure: false,
            ws: true,
            proxyTimeout: 3600000, // 1 hour for huge models
            timeout: 3600000,
            on: {
                proxyRes: (proxyRes, req, res) => {
                    const url = req.url || '';
                    if (!url.includes('/api/chat') && !url.includes('/api/generate')) {
                        return;
                    }

                    console.log(`[Bridge:ProxyRes] 🧠 Intercepting response for ${url}...`);
                    let responseData = '';
                    proxyRes.on('data', (chunk) => {
                        responseData += chunk.toString();
                    });

                    proxyRes.on('end', () => {
                        try {
                            const lines = responseData.split('\n').filter(line => line.trim());
                            let fullAnswer = '';
                            
                            for (const line of lines) {
                                try {
                                    const data = JSON.parse(line);
                                    const content = data.message ? data.message.content : data.response;
                                    if (content) fullAnswer += content;
                                } catch (e) { /* partial line */ }
                            }

                            if (fullAnswer.trim()) {
                                console.log(`[Bridge:ProxyRes] ✅ Captured (${fullAnswer.length} chars). Emitting response...`);
                                this.emit('response', {
                                    question: "External Ollama Request",
                                    answer: fullAnswer.trim(),
                                    timestamp: new Date().toISOString()
                                });
                            }
                        } catch (err) {
                            console.error('[Bridge:ProxyRes] ❌ Error processing stream:', err.message);
                        }
                    });
                },
                error: (err, req, res) => {
                    console.error(`[Bridge] Proxy Error for ${req.url}:`, err.message);
                    if (res && !res.headersSent) {
                        res.status(504).json({ error: 'Ollama engine not responding', details: err.message });
                    }
                }
            }
        }));
    }

    async start() {
        console.log(`[Bridge] Checking engine on port ${this.targetPort}...`);
        
        // Wait for engine to be available (max 10 seconds)
        let engineReady = false;
        const http = require('http');
        
        for (let i = 0; i < 10; i++) {
            try {
                await new Promise((resolve) => {
                    const req = http.get(`http://127.0.0.1:${this.targetPort}/api/tags`, { timeout: 1000 }, (res) => {
                        engineReady = true;
                        resolve();
                    });
                    req.on('error', () => setTimeout(resolve, 1000));
                    req.on('timeout', () => { req.destroy(); setTimeout(resolve, 1000); });
                });
                if (engineReady) break;
            } catch (e) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!engineReady) {
            console.warn(`[Bridge] Engine on ${this.targetPort} not detected yet.`);
        } else {
            console.log(`[Bridge] Engine detected on ${this.targetPort}!`);
        }

        try {
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`[Bridge] Transparent Proxy on ${this.port} -> Engine on ${this.targetPort}`);
            });
            
            this.server.timeout = 3600000;
            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[Bridge] Port ${this.port} busy, retrying...`);
                    setTimeout(() => this.start(), 2000);
                } else {
                    console.error('[Bridge] Server Error:', err.message);
                }
            });
        } catch (error) {
            console.error('[Bridge] Failed to start:', error);
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = OllamaBridgeManager;