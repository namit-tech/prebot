// hologram-server.js - Run this on hologram PC
const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());

let currentVideo = null;
let vlcProcess = null;

// API endpoints
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        device: 'Hologram Fan Controller',
        currentVideo: currentVideo 
    });
});

app.post('/api/play', (req, res) => {
    const { video, loop } = req.body;
    
    if (!video) {
        return res.status(400).json({ error: 'Video name required' });
    }
    
    console.log(`🎬 Received play command: ${video}`);
    
    // Stop current video
    if (vlcProcess) {
        vlcProcess.kill();
        vlcProcess = null;
    }
    
    // Start new video
    const videoPath = path.join(__dirname, 'videos', video);
    
    // Check if video file exists
    const fs = require('fs');
    if (!fs.existsSync(videoPath)) {
        console.error(`❌ Video file not found: ${videoPath}`);
        return res.status(404).json({ error: 'Video file not found' });
    }
    
    // VLC command for hologram fan
    const vlcCommand = `vlc "${videoPath}" --loop --fullscreen --no-audio --video-on-top`;
    
    vlcProcess = exec(vlcCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Video play error:', error);
        } else {
            console.log(`✅ Video playing: ${video}`);
        }
    });
    
    currentVideo = video;
    res.json({ success: true, video: video });
});

app.post('/api/stop', (req, res) => {
    console.log('🛑 Received stop command');
    
    if (vlcProcess) {
        vlcProcess.kill();
        vlcProcess = null;
        console.log('✅ Video stopped');
    } else {
        console.log('ℹ️ No video playing');
    }
    
    currentVideo = null;
    res.json({ success: true });
});

// Start server
app.listen(8080, '0.0.0.0', () => {
    console.log('🎬 Hologram Fan Controller started!');
    console.log('📡 Server running on port 8080');
    console.log('🔗 Ready to receive commands from AI Assistant');
    console.log('📁 Make sure videos are in the "videos" folder');
    console.log('🎥 Install VLC media player for video playback');
    console.log('');
    console.log('📋 Available endpoints:');
    console.log('   GET  /api/status - Check server status');
    console.log('   POST /api/play  - Play video');
    console.log('   POST /api/stop  - Stop video');
    console.log('');
    console.log('🎯 Test with: curl http://localhost:8080/api/status');
});

// Handle process exit
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down hologram server...');
    if (vlcProcess) {
        vlcProcess.kill();
    }
    process.exit(0);
});
