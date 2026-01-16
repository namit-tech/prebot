const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Module ID is required']
  },
  name: {
    type: String,
    required: [true, 'Module name is required']
  },
  version: {
    type: String,
    required: [true, 'Module version is required'],
    default: '1.0.0'
  },
  description: {
    type: String
  },
  requiresNetwork: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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

// Indexes
moduleSchema.index({ id: 1 }, { unique: true });
moduleSchema.index({ isActive: 1 });

// Update timestamp on save
moduleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Module', moduleSchema);

