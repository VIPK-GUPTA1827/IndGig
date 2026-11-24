const mongoose = require('mongoose');

const oAuthAttemptSchema = new mongoose.Schema({
  stateHash: {
    type: String,
    required: true,
    index: true
  },
  browserHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['client', 'freelancer'],
    default: 'freelancer'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index for automatic document cleanup
  }
}, { timestamps: true });

module.exports = mongoose.model('OAuthAttempt', oAuthAttemptSchema);
