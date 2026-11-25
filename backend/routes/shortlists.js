const express = require('express');
const mongoose = require('mongoose');
const Shortlist = require('../models/Shortlist');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_FREELANCER_FIELDS = 'name username avatar headline hourlyRate skills workPreference weeklyCapacity availabilityStatus verificationBadge';

// @desc    Save a freelancer to client shortlist (idempotent)
// @route   POST /api/shortlists
// @access  Private (Client/Admin)
router.post('/', protect, authorize('client', 'admin'), async (req, res, next) => {
  try {
    const { freelancerId, projectId = null, privateNote = '' } = req.body;
    if (!freelancerId || !mongoose.isValidObjectId(freelancerId)) {
      return res.status(400).json({ success: false, message: 'Valid freelancerId is required' });
    }
    if (String(freelancerId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot shortlist yourself' });
    }

    const target = await User.findById(freelancerId).select('role isSuspended isEmailVerified');
    if (!target || target.role !== 'freelancer' || target.isSuspended || !target.isEmailVerified) {
      return res.status(404).json({ success: false, message: 'Eligible freelancer not found' });
    }

    const update = {
      privateNote: typeof privateNote === 'string' ? privateNote.trim().slice(0, 500) : ''
    };
    if (projectId && mongoose.isValidObjectId(projectId)) {
      update.project = projectId;
    }

    const entry = await Shortlist.findOneAndUpdate(
      { owner: req.user._id, freelancer: freelancerId },
      { $set: update, $setOnInsert: { owner: req.user._id, freelancer: freelancerId } },
      { upsert: true, returnDocument: 'after' }
    ).populate('freelancer', PUBLIC_FREELANCER_FIELDS);

    res.status(200).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// @desc    Get current user's shortlisted freelancers
// @route   GET /api/shortlists
// @access  Private (Client/Admin)
router.get('/', protect, authorize('client', 'admin'), async (req, res, next) => {
  try {
    const items = await Shortlist.find({ owner: req.user._id })
      .populate('freelancer', PUBLIC_FREELANCER_FIELDS)
      .populate('project', 'title status budget')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// @desc    Remove a freelancer from shortlist
// @route   DELETE /api/shortlists/:id
// @access  Private (Owner)
router.delete('/:id', protect, authorize('client', 'admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shortlist ID' });
    }
    const deleted = await Shortlist.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Shortlist entry not found' });
    }
    res.json({ success: true, message: 'Removed from shortlist' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
