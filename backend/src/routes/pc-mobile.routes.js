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

module.exports = router;






