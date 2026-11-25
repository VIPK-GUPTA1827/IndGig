const mongoose = require('mongoose');

const SavedSearchSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['projects', 'developers'],
    default: 'projects'
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  filters: {
    search: { type: String, default: '', trim: true, maxlength: 80 },
    category: { type: String, default: '', trim: true, maxlength: 60 },
    skills: [{ type: String, trim: true, maxlength: 40 }],
    minBudget: { type: Number, default: null },
    maxBudget: { type: Number, default: null },
    workPreference: { type: String, default: '', trim: true }
  },
  frequency: {
    type: String,
    enum: ['instant', 'daily', 'off'],
    default: 'daily'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastProcessedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('SavedSearch', SavedSearchSchema);
