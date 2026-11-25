const express = require('express');
const { protect } = require('../middleware/auth');
const { PLAN_ENTITLEMENTS, getEffectivePlan } = require('../config/plans');

const router = express.Router();

// @desc    Public plan catalog (entitlements config)
// @route   GET /api/plans
// @access  Public
router.get('/', (_req, res) => {
  res.json({ success: true, data: PLAN_ENTITLEMENTS });
});

// @desc    Current user's effective plan & entitlements
// @route   GET /api/plans/me
// @access  Private
router.get('/me', protect, (req, res) => {
  const effective = getEffectivePlan(req.user);
  res.json({ success: true, data: effective });
});

module.exports = router;
