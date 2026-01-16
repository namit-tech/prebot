const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/status', authenticate, subscriptionController.getMySubscription);

module.exports = router;

