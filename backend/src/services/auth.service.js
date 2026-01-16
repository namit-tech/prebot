const User = require('../models/User');
const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { generateLicenseToken } = require('./license.service');

class AuthService {
  async login(email, password) {
    // Find user
    const user = await User.findOne({ email }).populate('subscription');
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is inactive');
    }

    // Superadmin doesn't need subscription check
    if (user.role !== 'superadmin') {
      // Check subscription
      if (!user.subscription) {
        throw new Error('No subscription found');
      }

      // Check subscription status
      if (user.subscription.status !== 'active') {
        throw new Error('Subscription is not active');
      }

      // Check expiry
      if (new Date() > user.subscription.expiryDate) {
        // Update subscription status
        await Subscription.findByIdAndUpdate(user.subscription._id, {
          status: 'expired'
        });
        throw new Error('Subscription expired');
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate license token (only for clients, not superadmin)
    let licenseToken = null;
    let expiryDate = null;
    let models = [];

    if (user.role !== 'superadmin' && user.subscription) {
      licenseToken = await generateLicenseToken(user.subscription);
      expiryDate = user.subscription.expiryDate;
      models = user.subscription.models || [];
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        subscriptionId: user.subscription?._id || null
      },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expiresIn }
    );

    return {
      token,
      licenseToken,
      expiryDate,
      models,
      user: {
        id: user._id,
        email: user.email,
        companyName: user.companyName,
        role: user.role,
        subscription: user.role !== 'superadmin' && user.subscription ? {
            models: user.subscription.models,
            aiModel: user.subscription.aiModel || 'gemma2:2b',
            expiryDate: user.subscription.expiryDate
        } : null
      }
    };
  }

  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, jwtConfig.secret);
      const user = await User.findById(decoded.userId).populate('subscription');
      
      if (!user) {
        return { valid: false, error: 'Invalid token' };
      }

      // Superadmin doesn't need subscription
      if (user.role !== 'superadmin' && !user.subscription) {
        return { valid: false, error: 'No subscription found' };
      }

      return {
        valid: true,
        user,
        subscription: user.subscription || null
      };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }
}

module.exports = new AuthService();

