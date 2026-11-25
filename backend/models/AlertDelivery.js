const mongoose = require('mongoose');

const AlertDeliverySchema = new mongoose.Schema({
  savedSearch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SavedSearch',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gig',
    required: true
  },
  channel: {
    type: String,
    enum: ['in_app', 'email'],
    required: true
  }
}, { timestamps: true });

AlertDeliverySchema.index({ savedSearch: 1, project: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('AlertDelivery', AlertDeliverySchema);
