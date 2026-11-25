const express = require('express');
const mongoose = require('mongoose');
const ProjectInvite = require('../models/ProjectInvite');
const Gig = require('../models/Gig');
const User = require('../models/User');
const { protect, authorize, requireVerifiedEmail } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');

const router = express.Router();

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function createGigInvite(req, res, next) {
  try {
    const gigId = req.params.id;
    const { freelancerId, message = '' } = req.body;

    if (!mongoose.isValidObjectId(gigId) || !freelancerId || !mongoose.isValidObjectId(freelancerId)) {
      return res.status(400).json({ success: false, message: 'Valid gig and freelancer IDs are required' });
    }
    if (String(freelancerId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot invite yourself' });
    }

    const gig = await Gig.findById(gigId).select('client title status');
    if (!gig) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (String(gig.client) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only project owner can send invites' });
    }
    if (gig.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Can only invite developers to open projects' });
    }

    const freelancer = await User.findById(freelancerId).select('role isSuspended isEmailVerified');
    if (!freelancer || freelancer.role !== 'freelancer' || freelancer.isSuspended || !freelancer.isEmailVerified) {
      return res.status(404).json({ success: false, message: 'Eligible freelancer not found' });
    }

    const existing = await ProjectInvite.findOne({
      project: gig._id,
      freelancer: freelancer._id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });
    if (existing) {
      return res.status(200).json({ success: true, data: existing, duplicate: true });
    }

    const invite = await ProjectInvite.create({
      project: gig._id,
      client: req.user._id,
      freelancer: freelancer._id,
      message: typeof message === 'string' ? message.trim().slice(0, 800) : '',
      expiresAt: new Date(Date.now() + INVITE_TTL_MS)
    });

    await sendNotification(
      req.app,
      freelancer._id,
      req.user._id,
      'invite_received',
      'New Project Invitation',
      `You were invited to discuss "${gig.title}"`,
      gig._id,
      { email: false }
    );

    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await ProjectInvite.findOne({
        project: req.params.id,
        freelancer: req.body.freelancerId,
        status: 'pending'
      });
      return res.status(200).json({ success: true, data: existing, duplicate: true });
    }
    next(err);
  }
}

// @desc    Get invites for current user (received for freelancer, sent for client)
// @route   GET /api/invites
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const query = req.user.role === 'client'
      ? { client: req.user._id }
      : { freelancer: req.user._id };

    const invites = await ProjectInvite.find(query)
      .populate('project', 'title budget category status')
      .populate('client', 'name username avatar companyName')
      .populate('freelancer', 'name username avatar headline hourlyRate')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: invites });
  } catch (err) {
    next(err);
  }
});

// @desc    Respond to or withdraw a project invite
// @route   PATCH /api/invites/:id
// @access  Private
router.patch('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid invite ID' });
    }

    const { status } = req.body;
    const invite = await ProjectInvite.findById(req.params.id).populate('project', 'title');
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    const isFreelancer = String(invite.freelancer) === String(req.user._id);
    const isClient = String(invite.client) === String(req.user._id);
    if (!isFreelancer && !isClient) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this invitation' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Invitation is already ${invite.status}` });
    }
    if (invite.expiresAt <= new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ success: false, message: 'Invitation has expired' });
    }

    if (isFreelancer) {
      if (!['accepted', 'declined'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Freelancer can only accept or decline an invite' });
      }
      invite.status = status;
      await invite.save();

      if (status === 'accepted') {
        await sendNotification(
          req.app,
          invite.client,
          req.user._id,
          'invite_accepted',
          'Invitation Accepted',
          `${req.user.name || req.user.username} accepted your invite for "${invite.project?.title || 'your project'}"`,
          invite.project?._id || invite._id,
          { email: false }
        );
      }
    } else {
      if (status !== 'withdrawn') {
        return res.status(400).json({ success: false, message: 'Client can only withdraw a pending invite' });
      }
      invite.status = 'withdrawn';
      await invite.save();
    }

    res.json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.createGigInvite = [protect, authorize('client', 'admin'), requireVerifiedEmail, createGigInvite];
