const mongoose = require('mongoose');

const MembershipSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'recruiter', 'reviewer'], default: 'reviewer' },
  status: { type: String, enum: ['active', 'removed'], default: 'active' }
}, { timestamps: true });

MembershipSchema.index({ organization: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Membership', MembershipSchema);
