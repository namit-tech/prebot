const express = require('express');
const router = express.Router();

// Health check for mobile app connection
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'PC server is running' });
});

// Trigger video on PC when question is asked from mobile
router.post('/trigger-video', (req, res) => {
  const { questionId, question, answer } = req.body;
  
  // Emit event to Electron main process if available
  // This will trigger hologram video playback
  console.log('📱 Mobile question received:', question);
  console.log('🎬 Triggering video for question:', questionId);
  
  res.json({
    success: true,
    message: 'Video trigger received'
  });
});

const messageQueue = [];

// Chat endpoint for detailed AI interaction
router.post('/chat', (req, res) => {
    const { message, email, model } = req.body;
    
    console.log(`\n📨 [MOBILE MESSAGE] from ${email}:`);
    console.log(`💬 "${message}"`);
    console.log(`🤖 Model: ${model || 'default'}`);

    // Store for polling
    messageQueue.push({
        id: Date.now(),
        message,
        email,
        timestamp: new Date()
    });
    // Keep only last 10
    if (messageQueue.length > 10) messageQueue.shift();
    
    res.json({
        success: true,
        message: 'Message received on PC',
        reply: `Echo: I received "${message}"`
    });
});

// Polling endpoint for Frontend
router.get('/messages/poll', (req, res) => {
    res.json({ success: true, messages: messageQueue });
});

module.exports = router;






