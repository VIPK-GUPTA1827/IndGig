const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const OrgInvite = require('../models/OrgInvite');
const Gig = require('../models/Gig');
const { protect, authorize } = require('../middleware/auth');
const { getEffectivePlan } = require('../config/plans');

const router = express.Router();
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

async function loadActiveMembership(orgId, userId) {
  if (!mongoose.isValidObjectId(orgId)) return null;
  return Membership.findOne({ organization: orgId, user: userId, status: 'active' });
}

// @desc    Create a company/agency organization
// @route   POST /api/organizations
// @access  Private (Client/Admin)
router.post('/', protect, authorize('client', 'admin'), async (req, res, next) => {
  try {
    const { name, website = '', logo = '' } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Organization name is required' });
    }
    const org = await Organization.create({
      name: name.trim().slice(0, 120),
      website: typeof website === 'string' ? website.trim().slice(0, 240) : '',
      logo: typeof logo === 'string' ? logo.trim() : '',
      owner: req.user._id
    });
    await Membership.create({
      organization: org._id,
      user: req.user._id,
      role: 'owner',
      status: 'active'
    });
    res.status(201).json({ success: true, data: org });
  } catch (err) {
    next(err);
  }
});

// @desc    Get organizations where current user is an active member
// @route   GET /api/organizations
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const memberships = await Membership.find({ user: req.user._id, status: 'active' })
      .populate('organization')
      .lean();
    const orgs = memberships
      .filter((m) => m.organization && m.organization.status === 'active')
      .map((m) => ({ ...m.organization, myRole: m.role }));
    res.json({ success: true, data: orgs });
  } catch (err) {
    next(err);
  }
});

// @desc    Get organization members (scoped to active members)
// @route   GET /api/organizations/:id/members
// @access  Private (Active Member)
router.get('/:id/members', protect, async (req, res, next) => {
  try {
    const membership = await loadActiveMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Organization access denied' });
    }
    const members = await Membership.find({ organization: req.params.id, status: 'active' })
      .populate('user', 'name username email avatar')
      .lean();
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
});

// @desc    Invite a team member (single-use, time-limited token)
// @route   POST /api/organizations/:id/invites
// @access  Private (Owner only)
router.post('/:id/invites', protect, async (req, res, next) => {
  try {
    const membership = await loadActiveMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only organization owner can invite members' });
    }
    const { email, role = 'reviewer' } = req.body;
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid member email is required' });
    }
    if (!['recruiter', 'reviewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be recruiter or reviewer' });
    }

    const { entitlements } = getEffectivePlan(req.user);
    const activeCount = await Membership.countDocuments({ organization: req.params.id, status: 'active' });
    if (activeCount >= entitlements.teamSeatLimit) {
      return res.status(403).json({
        success: false,
        code: 'SEAT_LIMIT_EXCEEDED',
        message: `Team seat limit (${entitlements.teamSeatLimit}) reached for your current plan`,
        limit: entitlements.teamSeatLimit
      });
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    await OrgInvite.create({
      organization: req.params.id,
      email: email.toLowerCase().trim(),
      role,
      tokenHash: sha256(rawToken),
      invitedBy: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.status(201).json({ success: true, inviteToken: rawToken, role });
  } catch (err) {
    next(err);
  }
});

// @desc    Accept a single-use team invitation
// @route   POST /api/organizations/invites/:token/accept
// @access  Private
router.post('/invites/:token/accept', protect, async (req, res, next) => {
  try {
    const invite = await OrgInvite.findOneAndUpdate(
      {
        tokenHash: sha256(req.params.token),
        consumedAt: null,
        expiresAt: { $gt: new Date() }
      },
      { $set: { consumedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!invite) {
      return res.status(400).json({ success: false, message: 'Invitation expired or already used' });
    }

    const member = await Membership.findOneAndUpdate(
      { organization: invite.organization, user: req.user._id },
      { $set: { role: invite.role, status: 'active' } },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
});

// @desc    Update member role or remove member
// @route   PATCH /api/organizations/:id/members/:memberId
// @access  Private (Owner only)
router.patch('/:id/members/:memberId', protect, async (req, res, next) => {
  try {
    const ownerMem = await loadActiveMembership(req.params.id, req.user._id);
    if (!ownerMem || ownerMem.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only organization owner can manage members' });
    }

    const target = await Membership.findOne({ _id: req.params.memberId, organization: req.params.id });
    if (!target) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (String(target.user) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Owner cannot remove or demote self' });
    }

    if (req.body.status === 'removed') {
      target.status = 'removed';
    } else if (['recruiter', 'reviewer'].includes(req.body.role)) {
      target.role = req.body.role;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid member update' });
    }

    await target.save();
    res.json({ success: true, data: target });
  } catch (err) {
    next(err);
  }
});

// @desc    Get organization scoped projects
// @route   GET /api/organizations/:id/projects
// @access  Private (Active Member)
router.get('/:id/projects', protect, async (req, res, next) => {
  try {
    const membership = await loadActiveMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Organization access denied' });
    }
    const gigs = await Gig.find({ organization: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: gigs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
