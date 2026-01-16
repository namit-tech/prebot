const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate, isAdmin, isSuperAdmin } = require('../middleware/auth.middleware');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');

// Validation rules
const createClientValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('companyName')
    .notEmpty()
    .withMessage('Company name is required'),
  body('subscriptionData.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date format'),
  body('subscriptionData.models')
    .isArray()
    .withMessage('Models must be an array')
];

router.post('/clients', authenticate, isSuperAdmin, createClientValidation, validate, adminController.createClient);
router.post('/extend-subscription', authenticate, isSuperAdmin, adminController.extendSubscription);
router.get('/clients', authenticate, isSuperAdmin, adminController.getAllClients);
router.get('/clients/:id', authenticate, isSuperAdmin, adminController.getClientById);
router.put('/clients/:id', authenticate, isSuperAdmin, validate, adminController.updateClient);
router.put('/clients/:id/reset-lock', authenticate, isSuperAdmin, adminController.resetDeviceLock);
router.delete('/clients/:id', authenticate, isSuperAdmin, adminController.deleteClient);

module.exports = router;

