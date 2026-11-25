const mongoose = require('mongoose');

const ShortlistSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gig',
    default: null
  },
  privateNote: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  }
}, { timestamps: true });

ShortlistSchema.index({ owner: 1, freelancer: 1 }, { unique: true });

module.exports = mongoose.model('Shortlist', ShortlistSchema);
