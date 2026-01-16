const subscriptionService = require('../services/subscription.service');
const { asyncHandler } = require('../utils/helpers');

class SubscriptionController {
  getMySubscription = asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.getUserSubscription(req.user._id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  });
}

module.exports = new SubscriptionController();

