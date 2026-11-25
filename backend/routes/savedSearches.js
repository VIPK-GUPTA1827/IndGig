const express = require('express');
const mongoose = require('mongoose');
const SavedSearch = require('../models/SavedSearch');
const { protect } = require('../middleware/auth');
const { getEffectivePlan } = require('../config/plans');

const router = express.Router();

const VALID_FREQUENCIES = new Set(['instant', 'daily', 'off']);
const VALID_TYPES = new Set(['projects', 'developers']);

function sanitizeFilters(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const minBudget = raw.minBudget !== undefined && raw.minBudget !== '' && raw.minBudget !== null
    ? Number(raw.minBudget) : null;
  const maxBudget = raw.maxBudget !== undefined && raw.maxBudget !== '' && raw.maxBudget !== null
    ? Number(raw.maxBudget) : null;

  return {
    search: typeof raw.search === 'string' ? raw.search.trim().slice(0, 80) : '',
    category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 60) : '',
    skills: Array.isArray(raw.skills)
      ? raw.skills.map((s) => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 10)
      : [],
    minBudget: Number.isFinite(minBudget) && minBudget >= 0 ? minBudget : null,
    maxBudget: Number.isFinite(maxBudget) && maxBudget >= 0 ? maxBudget : null,
    workPreference: typeof raw.workPreference === 'string' ? raw.workPreference.trim().slice(0, 20) : ''
  };
}

// @desc    Create a saved search
// @route   POST /api/saved-searches
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    const { name, type = 'projects', filters = {}, frequency = 'daily' } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Search name is required' });
    }
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ success: false, message: 'Invalid saved search type' });
    }
    if (!VALID_FREQUENCIES.has(frequency)) {
      return res.status(400).json({ success: false, message: 'Invalid alert frequency' });
    }

    const { entitlements } = getEffectivePlan(req.user);
    const currentCount = await SavedSearch.countDocuments({ owner: req.user._id });
    if (currentCount >= entitlements.savedSearchLimit) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED',
        message: `Saved search limit (${entitlements.savedSearchLimit}) reached for your current plan`,
        limit: entitlements.savedSearchLimit
      });
    }

    const doc = await SavedSearch.create({
      owner: req.user._id,
      type,
      name: name.trim().slice(0, 100),
      filters: sanitizeFilters(filters),
      frequency,
      enabled: frequency !== 'off'
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

// @desc    Get current user's saved searches
// @route   GET /api/saved-searches
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const list = await SavedSearch.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// @desc    Update saved search (name, frequency, enabled, filters)
// @route   PATCH /api/saved-searches/:id
// @access  Private (Owner)
router.patch('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid saved search ID' });
    }
    const existing = await SavedSearch.findOne({ _id: req.params.id, owner: req.user._id });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Saved search not found' });
    }

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      existing.name = req.body.name.trim().slice(0, 100);
    }
    if (req.body.frequency !== undefined) {
      if (!VALID_FREQUENCIES.has(req.body.frequency)) {
        return res.status(400).json({ success: false, message: 'Invalid alert frequency' });
      }
      existing.frequency = req.body.frequency;
    }
    if (req.body.enabled !== undefined) {
      existing.enabled = Boolean(req.body.enabled);
    }
    if (req.body.filters && typeof req.body.filters === 'object') {
      existing.filters = sanitizeFilters(req.body.filters);
    }

    await existing.save();
    res.json({ success: true, data: existing });
  } catch (err) {
    next(err);
  }
});

// @desc    Delete a saved search
// @route   DELETE /api/saved-searches/:id
// @access  Private (Owner)
router.delete('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid saved search ID' });
    }
    const deleted = await SavedSearch.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Saved search not found' });
    }
    res.json({ success: true, message: 'Saved search deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
