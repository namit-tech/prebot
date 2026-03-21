const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');

class PC2Server {
    constructor(dataDir = null, videosDir = null) {
        this.server = null;
        this.port = 3001;
        this.animationProcess = null;
        this.browserOpened = false; // Track if browser is already open
        this.currentAction = 'stop'; // Initialize current action
        this.runId = 0; // Unique ID to force re-trigger when action is already 'start'
        this.currentVideo = null; // Store whatever video was just requested to play
        this.dataDir = dataDir || __dirname; // Use provided data directory or fallback to __dirname
        this.videosDir = videosDir || path.join(__dirname, 'assets', 'videos'); // Use provided videos directory
        this.setupServer();
        
        // Open browser once on startup
        setTimeout(() => {
            this.openBrowserWindow();
        }, 2000); // Wait 2 seconds for server to start
    }

    setupServer() {
        const expressApp = express();
        
        // Enable CORS
        expressApp.use(cors());
        expressApp.use(express.json());
        expressApp.use(express.static(path.join(__dirname))); // Serve entire directory
        
        // Serve assets directory - try writable directory first, then fallback to app directory
        const appAssetsPath = path.join(__dirname, 'assets');
        const fs = require('fs');
        
        // Try to serve from userData assets first (for uploaded videos)
        const userDataPath = this.dataDir.split(path.sep).slice(0, -1).join(path.sep); // Go up from 'data' to userData
        const writableAssetsPath = path.join(userDataPath, 'assets');
        
        // Serve from writable directory if it exists (for user-uploaded content)
        if (fs.existsSync(writableAssetsPath)) {
            expressApp.use('/assets', express.static(writableAssetsPath));
            console.log(`📁 Serving assets from writable directory: ${writableAssetsPath}`);
        }
        
        // Always serve from app directory as fallback (for bundled assets)
        if (fs.existsSync(appAssetsPath)) {
            expressApp.use('/assets', express.static(appAssetsPath));
            console.log(`📁 Serving assets from app directory: ${appAssetsPath}`);
        }
        
        // Animation trigger endpoint
        expressApp.post('/api/animation-trigger', (req, res) => {
            const { action, video } = req.body; // 'start' or 'stop', plus optional video config
            
            console.log(`🎬 Animation trigger received: ${action} (immediate response)`);
            
            // Update state immediately
            this.currentAction = action;
            
            // Execute action immediately (synchronously)
            if (action === 'start') {
                // If a video payload was provided (e.g., from an external bridge), use it
                this.startAnimation(video);
            } else if (action === 'stop') {
                this.stopAnimation();
            }
            
            // Send immediate response (don't wait for animation to complete)
            res.json({ success: true, message: `Animation ${action}`, timestamp: Date.now() });
        });
        
        // Health check endpoint
        expressApp.get('/api/status', (req, res) => {
            res.json({ 
                status: 'online', 
                device: 'PC2 Animation Display',
                port: this.port 
            });
        });
        
        // Animation status endpoint (for display page polling)
        this.currentAction = 'stop';
        expressApp.get('/api/animation-status', (req, res) => {
            res.json({ action: this.currentAction, runId: this.runId });
        });
        
        // Primary video endpoint (for PC2 display to get whatever video is currently playing)
        expressApp.get('/api/primary-video', (req, res) => {
            try {
                if (this.currentVideo) {
                    const fs = require('fs');
                    let videoFileName = this.currentVideo.name;
                    if (this.currentVideo.path) {
                        videoFileName = path.basename(this.currentVideo.path);
                    }
                    
                    const writableVideoPath = path.join(this.videosDir, videoFileName);
                    const appVideoPath = path.join(__dirname, 'assets', 'videos', videoFileName);
                    const videoExists = fs.existsSync(writableVideoPath) || fs.existsSync(appVideoPath);
                    
                    const encodedFileName = encodeURIComponent(videoFileName);
                    
                    const videoInfo = {
                        ...this.currentVideo,
                        serverPath: `/api/video-stream/${encodedFileName}`,
                        filename: videoFileName,
                        exists: videoExists
                    };
                    
                    console.log(`📹 Serving dynamic hologram video: ${this.currentVideo.name}`);
                    res.json({ video: videoInfo });
                } else {
                    console.log('ℹ️ No dynamic video currently set for display');
                    res.json({ video: null });
                }
            } catch (error) {
                console.error('Error serving dynamic hologram video:', error);
                res.json({ video: null });
            }
        });
        

        // Dedicated video streaming route to bypass any express static bugs
        expressApp.get('/api/video-stream/:filename', (req, res) => {
            const fs = require('fs');
            const filename = decodeURIComponent(req.params.filename);
            
            const writableVideoPath = path.join(this.videosDir, filename);
            const appVideoPath = path.join(__dirname, 'assets', 'videos', filename);
            
            if (fs.existsSync(writableVideoPath)) {
                return res.sendFile(writableVideoPath);
            } else if (fs.existsSync(appVideoPath)) {
                return res.sendFile(appVideoPath);
            } else {
                return res.status(404).send('Video not found');
            }
        });

        // Serve animation display page
        expressApp.get('/display', (req, res) => {
            res.sendFile(path.join(__dirname, 'pc2-display.html'));
        });
        
        // Start server
        this.startServer(expressApp);
        
        console.log('🎬 PC2 Animation Server ready!');
        console.log(`📺 Display URL: http://localhost:${this.port}/display`);
        console.log(`📡 Listening for triggers from PC1...`);
    }

    startServer(expressApp) {
        this.server = expressApp.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 PC2 Server running on port ${this.port}`);
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

    openBrowserWindow() {
        if (this.browserOpened) {
            console.log('ℹ️  Browser already open, skipping...');
            return;
        }
        
        console.log('🌐 Opening browser window...');
        
        const { exec } = require('child_process');
        const url = `http://localhost:${this.port}/display`;
        
        const platform = process.platform;
        
        if (platform === 'win32') {
            exec(`start msedge ${url}`, (error) => {
                if (error) {
                    exec(`start chrome ${url}`, () => {
                        console.log('✅ Browser window opened');
                    });
                } else {
                    console.log('✅ Browser window opened');
                }
            });
        } else if (platform === 'darwin') {
            exec(`open -a "Google Chrome" ${url}`);
            console.log('✅ Browser window opened');
        } else {
            exec(`xdg-open ${url}`);
            console.log('✅ Browser window opened');
        }
        
        this.browserOpened = true;
    }
    
    startAnimation(videoConfig = null) {
        console.log('🎬 Starting animation... (immediate)');
        this.runId = Date.now();
        if (videoConfig) {
            this.currentVideo = videoConfig;
            console.log(`🎬 Received dynamic video config for: ${videoConfig.name}`);
        }
        this.currentAction = 'start';
        // No need to open browser, it's already open
        // The display page will poll for animation status and play video immediately
    }

    stopAnimation() {
        console.log('⏹️  Stopping animation... (immediate, synchronized with TTS end)');
        this.currentAction = 'stop'; // Update server state immediately
        // Browser stays open, only video stops playing
        // This is called exactly when TTS ends, ensuring perfect synchronization
        console.log('✅ Animation stopped immediately (synchronized with speech end)');
    }

    showNetworkInfo() {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        
        console.log('\n🎬 PC2 Network Information:');
        console.log('================================');
        
        Object.keys(networkInterfaces).forEach(interfaceName => {
            const interfaces = networkInterfaces[interfaceName];
            interfaces.forEach(netInterface => {
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    console.log(`📡 IP Address: ${netInterface.address}`);
                    console.log(`🎬 Ready to receive triggers from PC1`);
                }
            });
        });
        
        console.log('================================\n');
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.stopAnimation();
            console.log('PC2 server stopped');
        }
    }
}

module.exports = PC2Server;

// Auto-start if run directly
if (require.main === module) {
    const server = new PC2Server();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down PC2 server...');
        server.stop();
        process.exit(0);
    });
}

