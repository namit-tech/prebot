const User = require('../models/User');
const Subscription = require('../models/Subscription');
const subscriptionService = require('../services/subscription.service');
const licenseService = require('../services/license.service');
const { asyncHandler } = require('../utils/helpers');
const { calculateExpiryDate } = require('../utils/helpers');

class AdminController {
  createClient = asyncHandler(async (req, res) => {
    const { email, password, companyName, subscriptionData } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create user
    const user = new User({
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      companyName
    });
    await user.save();

    // Create subscription
    const subscription = await subscriptionService.createSubscription(
      user._id,
      subscriptionData
    );

    // Generate license token
    const licenseToken = await licenseService.generateLicenseToken(subscription);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          companyName: user.companyName
        },
        subscription: {
          id: subscription._id,
          expiryDate: subscription.expiryDate,
          models: subscription.models,
          type: subscription.type
        },
        licenseToken
      }
    });
  });

  extendSubscription = asyncHandler(async (req, res) => {
    const { subscriptionId, userId, additionalDays } = req.body;

    if (!subscriptionId && !userId) {
      return res.status(400).json({
        success: false,
        error: 'Either subscriptionId or userId is required'
      });
    }

    if (!additionalDays || additionalDays <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Additional days must be a positive number'
      });
    }

    let subscription;
    
    // If subscriptionId is provided, use it directly
    if (subscriptionId) {
      subscription = await Subscription.findById(subscriptionId);
    } 
    // Otherwise, find subscription by userId
    else if (userId) {
      subscription = await subscriptionService.getUserSubscription(userId);
    }
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found. Please create a subscription for this user first.'
      });
    }

    // Extend the subscription
    subscription = await subscriptionService.extendSubscription(
      subscription._id,
      additionalDays
    );

    // Regenerate license token
    const licenseToken = await licenseService.generateLicenseToken(subscription);

    res.json({
      success: true,
      data: {
        subscription,
        licenseToken
      }
    });
  });

  getAllClients = asyncHandler(async (req, res) => {
    const clients = await User.find()
      .populate('subscription')
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: clients
    });
  });

  getClientById = asyncHandler(async (req, res) => {
    const client = await User.findById(req.params.id)
      .populate('subscription')
      .select('-passwordHash');

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: client
    });
  });

  updateClient = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email, password, companyName, subscriptionData } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Update basic info
    if (email && email !== user.email) {
        // Check if new email is taken
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already in use' });
        }
        user.email = email;
    }
    if (companyName) user.companyName = companyName;
    if (password) user.passwordHash = password; // Will be hashed by pre-save hook

    await user.save();

    // Update Subscription if provided
    if (subscriptionData) {
        const subscription = await Subscription.findById(user.subscription);
        if (subscription) {
            if (subscriptionData.type) subscription.type = subscriptionData.type;
            if (subscriptionData.models) subscription.models = subscriptionData.models;
            if (subscriptionData.aiModel) subscription.aiModel = subscriptionData.aiModel;
            
            // Handle duration update (re-calculate expiry)
            if (subscriptionData.durationDays && subscriptionData.type === 'rental') {
                 // Reset start date to now or keep? Usually extending means adding to current expiry.
                 // But if editing "duration", it might mean "set total duration".
                 // Let's implement logic: if expiryDate provided use it, else if durationDays provided, calculate from NOW (reset) or extend? 
                 // Simple approach: Calculate new expiry date from TODAY if durationDays is explicitly changed.
                 subscription.expiryDate = calculateExpiryDate(subscriptionData.durationDays);
            }
            if (subscriptionData.status) subscription.status = subscriptionData.status; // allow re-activating
            
            await subscription.save();
             // Regenerate license token
             await licenseService.generateLicenseToken(subscription);
        }
    }

    res.json({
        success: true,
        data: { user }
    });
  });

  deleteClient = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Delete Subscription
    if (user.subscription) {
        await Subscription.findByIdAndDelete(user.subscription);
    }

    // Delete User
    await User.findByIdAndDelete(id);

    res.json({
        success: true,
        message: 'Client deleted successfully'
    });
  });

  resetDeviceLock = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
        return res.status(404).json({ success: false, error: 'Client not found' });
    }

    user.hardwareId = null; // Clear the lock
    await user.save();

    console.log(`🔓 Device lock reset for user: ${user.email} by Admin`);

    res.json({
        success: true,
        message: 'Device lock reset successfully. User can now login on a new device.'
    });
  });
}

module.exports = new AdminController();

