const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { calculateExpiryDate, calculateExpiryDateFromMinutes } = require('../utils/helpers');

class SubscriptionService {
  async createSubscription(userId, data) {
    let expiry = data.expiryDate;
    if (!expiry) {
      if (data.durationUnit === 'minutes') {
        expiry = calculateExpiryDateFromMinutes(data.durationValue || data.durationDays || 60);
      } else {
        expiry = calculateExpiryDate(data.durationValue || data.durationDays || 365);
      }
    }

    const subscription = new Subscription({
      userId,
      type: data.type,
      startDate: new Date(),
      expiryDate: expiry,
      models: data.models || ['predefined'],
      aiModel: data.aiModel || 'gemma2:2b',
      status: 'active'
    });

    await subscription.save();

    // Link to user
    await User.findByIdAndUpdate(userId, {
      subscription: subscription._id
    });

    return subscription;
  }

  async getUserSubscription(userId) {
    return await Subscription.findOne({ userId }).populate('userId');
  }

  async extendSubscription(subscriptionId, additionalDays) {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (!additionalDays || additionalDays <= 0) {
      throw new Error('Additional days must be a positive number');
    }

    const currentExpiry = new Date(subscription.expiryDate);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);

    subscription.expiryDate = newExpiry;
    subscription.status = 'active';
    subscription.updatedAt = new Date();
    await subscription.save();

    return subscription;
  }

  async checkExpiry() {
    const expired = await Subscription.find({
      expiryDate: { $lt: new Date() },
      status: 'active'
    });

    for (const sub of expired) {
      sub.status = 'expired';
      await sub.save();
    }

    return expired.length;
  }

  async updateSubscriptionStatus(subscriptionId, status) {
    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.status = status;
    await subscription.save();

    return subscription;
  }
}

module.exports = new SubscriptionService();

