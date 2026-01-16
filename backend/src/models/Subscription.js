const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  type: {
    type: String,
    enum: ['rental', 'permanent'],
    required: [true, 'Subscription type is required']
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  models: [{
    type: String,
    enum: ['predefined', 'gemini'],
    required: true
  }],
  aiModel: {
    type: String,
    default: 'gemma2:2b'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'suspended'],
    default: 'active'
  },
  licenseToken: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
subscriptionSchema.index({ userId: 1 }, { unique: true });
subscriptionSchema.index({ expiryDate: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ userId: 1, status: 1 }); // Compound index

// Update timestamp on save
subscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual to check if subscription is expired
subscriptionSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiryDate;
});

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && new Date() < this.expiryDate;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);

