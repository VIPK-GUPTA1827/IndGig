const mongoose = require('mongoose');

const OrgInviteSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['recruiter', 'reviewer'], default: 'reviewer' },
  tokenHash: { type: String, required: true, unique: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('OrgInvite', OrgInviteSchema);
