const express = require('express');
const cors = require('cors');
const path = require('path');

// [CLEANUP] Removed legacy questions-data.js loading.
// All questions are now loaded from questions-storage.json
let questionsData = [];

class DesktopServer {
    constructor(dataDir = null) {
        this.server = null;
        this.port = 5001;
        this.questions = questionsData || [];
        this.pendingQuestion = null;
        this.pendingRequests = new Map(); // Store pending AI requests
        this.dataDir = dataDir || __dirname; // Use provided data directory or fallback to __dirname
        this.chatHistory = [];
        this.activeModule = 'predefined'; // Default active module
        this.loadQuestionsFromFile();
        this.loadChatHistory();
        this.setupServer();
    }

    setActiveModule(moduleId) {
        this.activeModule = moduleId;
        console.log(`🔄 Active module updated on server: ${moduleId}`);
    }

    setMobilePresetsEnabled(enabled) {
        this.mobilePresetsEnabled = !!enabled;
        console.log(`📱 Mobile presets sync: ${this.mobilePresetsEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
    
    // Load chat history from file storage
    loadChatHistory() {
        try {
            const fs = require('fs');
            const path = require('path');
            const historyFile = path.join(this.dataDir, 'chat-history.json');
            
            if (fs.existsSync(historyFile)) {
                const fileContent = fs.readFileSync(historyFile, 'utf8');
                this.chatHistory = JSON.parse(fileContent) || [];
                console.log(`💬 Loaded ${this.chatHistory.length} messages from history`);
            } else {
                console.log('💬 No chat history file found, starting fresh');
                this.chatHistory = [];
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.chatHistory = [];
        }
    }

    // Save chat history to file storage
    saveChatHistory() {
        try {
            const fs = require('fs');
            const path = require('path');
            const historyFile = path.join(this.dataDir, 'chat-history.json');
            
            // Limit history to last 500 messages to prevent file bloat
            if (this.chatHistory.length > 500) {
                this.chatHistory = this.chatHistory.slice(-500);
            }
            
            fs.writeFileSync(historyFile, JSON.stringify(this.chatHistory, null, 2));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    // Add message to history
    addMessage(type, content, sender = 'unknown', timestamp = null) {
        const message = {
            type, // 'user', 'ai', 'system', 'error'
            content,
            sender, // 'mobile', 'pc', 'system'
            timestamp: timestamp || Date.now()
        };
        this.chatHistory.push(message);
        this.saveChatHistory();
        
        // Notify PC app via IPC if available
        this.sendToMain('new-chat-message', message);
    }
    
    // Load questions from file storage
    loadQuestionsFromFile() {
        try {
            const fs = require('fs');
            const path = require('path');
            const storageFile = path.join(this.dataDir, 'questions-storage.json');
            
            console.log(`📁 Data directory: ${this.dataDir}`);
            console.log(`📁 Storage file path: ${storageFile}`);
            
            if (fs.existsSync(storageFile)) {
                const fileContent = fs.readFileSync(storageFile, 'utf8');
                const stored = JSON.parse(fileContent);
                this.questions = stored.questions || [];
                console.log(`📚 Loaded ${this.questions.length} questions from file`);
                
                // Log password status (without showing the actual password)
                if (stored.unlockPassword) {
                    console.log(`🔑 Unlock password is set (${stored.unlockPassword.length} characters)`);
                } else {
                    console.log('⚠️  No unlock password found in storage file');
                }
            } else {
                console.log('📚 No questions file found, starting with empty list');
                this.questions = [];
            }
        } catch (error) {
            console.error('Error loading questions from file:', error);
            this.questions = [];
        }
    }

    // Get current questions (reloads from file to get latest data)
    getQuestions() {
        try {
            const fs = require('fs');
            const path = require('path');
            const storageFile = path.join(this.dataDir, 'questions-storage.json');
            
            if (fs.existsSync(storageFile)) {
                const fileContent = fs.readFileSync(storageFile, 'utf8');
                const stored = JSON.parse(fileContent);
                this.questions = stored.questions || [];
                return this.questions;
            } else {
                return this.questions || [];
            }
        } catch (error) {
            console.error('Error getting questions:', error);
            return this.questions || [];
        }
    }

    setupServer() {
        const expressApp = express();
        
        // Enable CORS for mobile access
        expressApp.use(cors());
        expressApp.use(express.json());
        
        // Serve mobile interface
        expressApp.get('/mobile', (req, res) => {
            res.sendFile(path.join(__dirname, 'mobile-questions.html'));
        });

        // Debug Route (Bypass Cache)
        expressApp.get('/mobile-new', (req, res) => {
            console.log('📱 Serving /mobile-new (Cache Bypass)');
            // Send headers to disable caching
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.sendFile(path.join(__dirname, 'mobile-questions.html'));
        });
        
        // Serve root page
        expressApp.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>AI Assistant Server</title>
                    <style>
                        body { font-family: Arial; padding: 50px; background: #f0f0f0; }
                        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                        h1 { color: #667eea; }
                        a { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 10px 5px 0 0; }
                        a:hover { background: #5568d3; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 Offline AI Assistant Server</h1>
                        <p>Server is running successfully!</p>
                        <p><strong>Mobile Access:</strong></p>
                        <a href="/mobile">📱 Open Mobile Interface</a>
                        <p><strong>Status:</strong> <span style="color: green;">✅ Online</span></p>
                    </div>
                </body>
                </html>
            `);
        });

        // API endpoints
        expressApp.get('/api/status', (req, res) => {
            res.json({ status: 'online', app: 'Offline AI Assistant' });
        });

        // 🟢 REQUIRED FOR MOBILE DISCOVERY 🟢
        expressApp.get('/api/health', (req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });

        expressApp.get('/api/active-module', (req, res) => {
            const models = this.currentUserSession ? (this.currentUserSession.models || []) : [];
            const isAIBrainAuthorized = models.includes('gemma') || models.includes('gemini') || models.includes('openai');
            
            res.json({ 
                activeModule: this.activeModule,
                mobilePresetsEnabled: this.mobilePresetsEnabled || false,
                isAIBrainAuthorized: isAIBrainAuthorized
            });
        });

        expressApp.get('/api/questions', (req, res) => {
            // Get current questions (cache is updated when saved)
            const questions = this.getQuestions();
            res.json(questions);
        });

        expressApp.get('/api/chat-history', (req, res) => {
            res.json(this.chatHistory);
        });

        // Add message from PC app
        expressApp.post('/api/chat-history', (req, res) => {
            const { type, content, sender, timestamp } = req.body;
            if (type && content) {
                this.addMessage(type, content, sender || 'pc', timestamp);
                res.json({ success: true });
            } else {
                res.status(400).json({ success: false, message: 'Invalid message format' });
            }
        });

        expressApp.get('/api/unlock-password', (req, res) => {
            // Get unlock password from storage file
            try {
                const fs = require('fs');
                const path = require('path');
                // Use this.dataDir (correct data directory) instead of __dirname
                const storageFile = path.join(this.dataDir, 'questions-storage.json');
                
                if (fs.existsSync(storageFile)) {
                    const fileContent = fs.readFileSync(storageFile, 'utf8');
                    const stored = JSON.parse(fileContent);
                    const password = stored.unlockPassword || '';
                    console.log(`🔑 Unlock password retrieved from: ${storageFile}`);
                    res.json({ password: password });
                } else {
                    console.warn(`⚠️  Password file not found at: ${storageFile}`);
                    res.json({ password: '' });
                }
            } catch (error) {
                console.error('Error loading unlock password:', error);
                res.json({ password: '' });
            }
        });

        expressApp.get('/api/mobile-heading', (req, res) => {
            // Get mobile heading from storage file
            try {
                const fs = require('fs');
                const path = require('path');
                // Use this.dataDir (correct data directory) instead of __dirname
                const storageFile = path.join(this.dataDir, 'questions-storage.json');
                
                if (fs.existsSync(storageFile)) {
                    const fileContent = fs.readFileSync(storageFile, 'utf8');
                    const stored = JSON.parse(fileContent);
                    const heading = stored.mobileHeading || '';
                    res.json({ heading: heading });
                } else {
                    res.json({ heading: '' });
                }
            } catch (error) {
                console.error('Error loading mobile heading:', error);
                res.json({ heading: '' });
            }
        });

        // Track password update timestamp for real-time sync
        this.passwordUpdateTimestamp = null;
        
        // Track current user session for mobile authentication
        this.currentUserSession = null;

        expressApp.post('/api/password-updated', (req, res) => {
            // Store timestamp when password was updated
            this.passwordUpdateTimestamp = Date.now();
            console.log('📱 Password update notification received');
            res.json({ success: true, timestamp: this.passwordUpdateTimestamp });
        });
        
        // Mobile Login Endpoint
        expressApp.post('/api/mobile-login', (req, res) => {
            const { email } = req.body;
            
            console.log(`📱 Mobile login attempt: ${email}`);
            
            if (!this.currentUserSession) {
                console.warn('⚠️ No active desktop session found');
                return res.status(401).json({ 
                    success: false, 
                    message: 'Desktop app is not logged in. Please log in to the desktop app first.' 
                });
            }
            
            // Normalize emails for comparison
            const sessionEmail = (this.currentUserSession.email || '').toLowerCase().trim();
            const requestEmail = (email || '').toLowerCase().trim();
            
            if (sessionEmail && sessionEmail === requestEmail) {
                console.log('✅ Mobile login successful for:', email);
                console.log('📤 Sending Models:', this.currentUserSession.models || []);
                return res.json({ 
                    success: true, 
                    message: 'Login successful',
                    user: {
                        email: sessionEmail,
                        role: this.currentUserSession.role,
                        expiryDate: this.currentUserSession.expiryDate,
                        models: this.currentUserSession.models || []
                    }
                });
            } else {
                console.warn(`❌ Mobile login failed. Expected: ${sessionEmail}, Got: ${requestEmail}`);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Email does not match the active desktop session.' 
                });
            }
        });

        // Debug Endpoint to check server state
        expressApp.get('/api/debug-session', (req, res) => {
            res.json({
                session: this.currentUserSession,
                hasSession: !!this.currentUserSession,
                models: this.currentUserSession ? this.currentUserSession.models : 'No Session'
            });
        });

        expressApp.get('/api/password-check', (req, res) => {
            // Mobile devices poll this endpoint to check if password was updated
            const lastCheck = parseInt(req.query.lastCheck) || 0;
            const wasUpdated = this.passwordUpdateTimestamp && this.passwordUpdateTimestamp > lastCheck;
            
            res.json({ 
                updated: wasUpdated,
                timestamp: this.passwordUpdateTimestamp || 0
            });
        });

        // --- ADAPTER FOR MOBILE STT (Fixes API Mismatch) ---
        expressApp.post('/api/chat', async (req, res) => {
            const { message, email, model } = req.body;
            console.log(`[ADAPTER] 📱 Translated '/api/chat' request: ${message}`);

            // Forward to the main processing logic (same as /api/process-question)
            // We reuse the existing logic by constructing a compatible request object
            const question = message;
            const history = []; // STT usually starts fresh context or handles history differently
            const inputType = 'voice';

            // ... Copy-paste logic or internal method call would be better, but for now we duplicate the core handoff
            // to sendToMain to ensure it works exactly like process-question
            
            const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            try {
                const responsePromise = new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        if (this.pendingRequests.has(requestId)) {
                            this.pendingRequests.delete(requestId);
                            reject(new Error('Desktop app timed out'));
                        }
                    }, 30000);
                    this.pendingRequests.set(requestId, { resolve, timeout });
                });

                this.addMessage('user', question, 'mobile');
                this.sendToMain('mobile-chat-request', { requestId, question, history, inputType });

                const result = await responsePromise;
                
                // Mobile expects specific response format?
                // The current mobile code just logs "Sent successfully" if res.ok
                // But if we want it to speak back, we might need to send a response the mobile understands.
                // For now, just sending success true is enough for the "Sent" confirmation.
                // The AUDIO output usually happens on the Desktop side in this architecture (Hologram).
                
                res.json({ success: true, answer: typeof result === 'object' ? result.answer : result });

            } catch (error) {
                console.error('Adapter Error:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        });
        // ---------------------------------------------------

        expressApp.post('/api/ask', (req, res) => {
            const { questionIndex, question, answer } = req.body;
            
            console.log(`[SYNC_DEBUG] 📱 Mobile question received: ${question}`);
            
            // 1. Store in queue (for polling backup)
            const questionData = { 
                questionIndex, 
                question, 
                answer, 
                inputType: 'voice', // Force voice for predefined questions
                timestamp: Date.now() 
            };
            this.pendingQuestion = questionData;
            
            // 2. EXPLICITLY SEND TO RENDERER (Primary Path)
            console.log('[SYNC_DEBUG] 📤 Pushing mobile-question to Renderer...');
            this.sendToMain('mobile-question', questionData);
            
            res.json({ success: true, message: 'Question sent to desktop' });
        });

        // Handle AI processing request from mobile
        expressApp.post('/api/process-question', async (req, res) => {
            const { question, history, inputType } = req.body;
            console.log(`[SYNC_DEBUG] 📱 Mobile AI Chat Request: ${question} (Type: ${inputType})`);

            // Create a unique ID for this request
            const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

            try {
                // Create a promise that will be resolved when the Desktop App responds
                const responsePromise = new Promise((resolve, reject) => {
                    // Set a timeout of 30 seconds
                    const timeout = setTimeout(() => {
                        if (this.pendingRequests.has(requestId)) {
                            this.pendingRequests.delete(requestId);
                            reject(new Error('Desktop app timed out'));
                        }
                    }, 30000);

                    // Store the resolve function
                    this.pendingRequests.set(requestId, { resolve, timeout });
                });

                if (this.activeModule === 'predefined') {
                    return res.status(403).json({ 
                        success: false, 
                        message: 'The AI Brain is currently disabled. Please switch to an AI Module on the desktop.' 
                    });
                }
                
                this.addMessage('user', question, 'mobile');
                // Send request to Electron Main process
                // Main process will forward to Renderer
                this.sendToMain('mobile-chat-request', { requestId, question, history, inputType });

                // Wait for response
                // Response might be a string (old) or object { answer, shouldSpeak } (new)
                const result = await responsePromise;
                
                if (typeof result === 'object' && result.answer) {
                    res.json({ 
                        success: true, 
                        answer: result.answer,
                        shouldSpeak: result.shouldSpeak || false
                    });
                } else {
                    res.json({ success: true, answer: result });
                }

            } catch (error) {
                console.error('AI Processing Error:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        });
        
        // Handle hologram triggers
        expressApp.post('/api/trigger-hologram', (req, res) => {
            const { action } = req.body; // 'start' or 'stop'
            this.triggerHologramVideo(action);
            this.triggerPC2Animation(action);
            res.json({ success: true, message: 'Hologram triggered' });
        });

        // Handle trigger video from mobile (Fix for missing endpoint)
        expressApp.post('/api/trigger-video', (req, res) => {
            const { questionId, question, answer } = req.body;
            console.log(`📱 Mobile video trigger received: ${question}`);
            
            // Trigger hologram processing in main window
            try {
                const { BrowserWindow } = require('electron');
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (mainWindow) {
                    // Send as mobile-question to trigger the full flow (TTS + Video) in renderer
                    mainWindow.webContents.send('mobile-question', {
                        question: question,
                        answer: answer,
                        source: 'mobile',
                        triggerVideo: true
                    });
                }
            } catch (error) {
                console.log('Electron communication failed (server mode?)');
            }
            
            // REMOVED: Direct triggers to prevent loops
            
            res.json({ success: true, message: 'Video trigger received' });
        });
        
        // Method to trigger hologram video
        this.triggerHologramVideo = (action = 'start') => {
            // Send message to main process to trigger hologram
            try {
                const { BrowserWindow } = require('electron');
                const mainWindow = BrowserWindow.getAllWindows()[0];
                
                if (mainWindow) {
                    mainWindow.webContents.send('trigger-hologram', { action });
                }
            } catch (error) {
                console.log('Electron not available (server mode)');
            }
        };
        
        // Method to trigger PC2 animation via network (now always localhost since integrated)
        this.triggerPC2Animation = (action = 'start') => {
            // Always use localhost since PC2 is now integrated
            const http = require('http');
            
            const targetIPs = [
                'localhost',      // Same PC (integrated)
                '127.0.0.1'       // Same PC alternative
            ];
            
            let attempts = 0;
            const tryConnect = () => {
                if (attempts >= targetIPs.length) {
                    console.log('⚠️  PC2 video server not responding (it should start automatically)');
                    return;
                }
                
                const targetIP = targetIPs[attempts];
                const options = {
                    hostname: targetIP,
                    port: 3001,
                    path: '/api/animation-trigger',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 2000
                };
                
                const req = http.request(options, (res) => {
                    console.log(`🎬 Video animation ${action} triggered (integrated mode)`);
                    this.pc2IP = targetIP;
                });
                
                req.on('error', () => {
                    attempts++;
                    if (attempts < targetIPs.length) {
                        setTimeout(tryConnect, 500); // Wait a bit before retry
                    } else {
                        console.log('⚠️  Video server not ready yet, will retry on next trigger');
                    }
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    attempts++;
                    if (attempts < targetIPs.length) {
                        setTimeout(tryConnect, 500);
                    }
                });
                
                req.write(JSON.stringify({ action }));
                req.end();
            };
            
            tryConnect();
        };
        
        this.pc2IP = null;

        // Start server
        this.startServer(expressApp);
        
        // Skip QR code generation in server mode
        // this.generateQRCode();
    }

    startServer(expressApp) {
        this.server = expressApp.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Desktop server running on port ${this.port}`);
            console.log(`📱 Mobile access: http://[YOUR_IP]:${this.port}/mobile`);
            this.showNetworkInfo();
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${this.port} is in use, trying port ${this.port + 1}`);
                this.port += 1;
                this.startServer(expressApp);
            } else {
                console.error('Server error:', err);
            }
        });
    }

    showNetworkInfo() {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        
        console.log('\n🌐 Network Information:');
        console.log('================================');
        
        Object.keys(networkInterfaces).forEach(interfaceName => {
            const interfaces = networkInterfaces[interfaceName];
            interfaces.forEach(netInterface => {
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    console.log(`📱 Mobile URL: http://${netInterface.address}:${this.port}/mobile`);
                    console.log(`💡 Enter this IP on mobile: ${netInterface.address}`);
                }
            });
        });
        
        console.log('================================\n');
        
        // Show popup if in Electron
        try {
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
                const { dialog } = require('electron');
                const interfaces = [];
                Object.keys(networkInterfaces).forEach(interfaceName => {
                    const iface = networkInterfaces[interfaceName];
                    iface.forEach(net => {
                        if (net.family === 'IPv4' && !net.internal) {
                            interfaces.push(net.address);
                        }
                    });
                });
                
                if (interfaces.length > 0) {
                    // Popup REMOVED as per user request (Step Id: 3522)
                    /* 
                    const message = `📱 Mobile Connection Ready!\n\nEnter this IP on mobile:\n${interfaces.join(' or ')}`;
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: '📱 Mobile Access',
                        message: 'Server is running!',
                        detail: message,
                        buttons: ['OK']
                    });
                    */
                }
            }
        } catch (e) {
            // Not in Electron, ignore
        }
    }

    generateQRCode() {
        // QR code generation disabled in server mode
        console.log('📱 QR code generation skipped in server mode');
    }
    
    updateUserSession(userData) {
        this.currentUserSession = userData || null;
        if (userData) {
            console.log(`👤 Desktop session updated: ${userData.email} (${userData.role})`);
        } else {
            console.log('👤 Desktop session cleared');
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            console.log('Desktop server stopped');
        }
    }

    // Helper to send data to Electron Main Window
    sendToMain(channel, data) {
        try {
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
                console.log(`[SYNC_DEBUG] 📡 Sending IPC '${channel}' to MainWindow`);
                mainWindow.webContents.send(channel, data);
            } else {
                console.warn('[SYNC_DEBUG] ⚠️ No active main window to send data to');
            }
        } catch (error) {
            console.error('[SYNC_DEBUG] Error sending to main window:', error);
        }
    }

    // Called by Main Process when Renderer sends back the answer
    resolveRequest(requestId, answer) {
        console.log(`🔍 [DesktopServer] Resolving Request ID: ${requestId}`);
        console.log(`📋 [DesktopServer] Pending Request IDs:`, Array.from(this.pendingRequests.keys()));

        if (this.pendingRequests.has(requestId)) {
            const { resolve, timeout } = this.pendingRequests.get(requestId);
            clearTimeout(timeout);
            
            // Extract the answer string if it's an object
            const answerText = (typeof answer === 'object' && answer.answer) ? answer.answer : answer;
            this.addMessage('ai', answerText, 'system');
            
            resolve(answer);
            this.pendingRequests.delete(requestId);
            console.log(`✅ [DesktopServer] Successfully Resolved Request ${requestId}`);
        } else {
            console.warn(`⚠️ [DesktopServer] Request ID ${requestId} not found in pending map!`);
        }
    }
}

module.exports = DesktopServer;

// Auto-start if run directly
if (require.main === module) {
    const server = new DesktopServer();
    console.log('🌐 Desktop server started');
}

