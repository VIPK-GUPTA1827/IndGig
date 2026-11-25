const mongoose = require('mongoose');

const ProjectInviteSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gig',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'withdrawn', 'expired'],
    default: 'pending'
  },
  message: {
    type: String,
    default: '',
    trim: true,
    maxlength: 800
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

ProjectInviteSchema.index(
  { project: 1, freelancer: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('ProjectInvite', ProjectInviteSchema);
