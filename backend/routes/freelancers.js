const express = require('express');
const User = require('../models/User');
const { getPagination } = require('../utils/paginate');

const router = express.Router();

const PUBLIC_FREELANCER_SELECT = [
  '_id',
  'name',
  'username',
  'avatar',
  'headline',
  'bio',
  'skills',
  'hourlyRate',
  'experienceLevel',
  'workPreference',
  'location',
  'weeklyCapacity',
  'availabilityStatus',
  'verificationBadge',
  'createdAt'
].join(' ');

const VALID_WORK_PREFS = new Set(['remote', 'onsite', 'hybrid']);
const VALID_AVAILABILITY = new Set(['available', 'limited', 'unavailable']);
const SORT_MAP = {
  relevance: { verificationBadge: -1, createdAt: -1 },
  rate_asc: { hourlyRate: 1, createdAt: -1 },
  rate_desc: { hourlyRate: -1, createdAt: -1 },
  newest: { createdAt: -1 }
};

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Public searchable freelancer directory
// @route   GET /api/freelancers
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 12, maxLimit: 30 });
    const filter = {
      role: 'freelancer',
      isEmailVerified: true,
      isSuspended: { $ne: true },
      isDiscoverable: { $ne: false }
    };

    const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    if (rawSearch) {
      const rx = new RegExp(escapeRegex(rawSearch), 'i');
      filter.$or = [
        { name: rx },
        { username: rx },
        { headline: rx },
        { 'skills.name': rx }
      ];
    }

    const rawSkill = typeof req.query.skill === 'string' ? req.query.skill.trim().slice(0, 40) : '';
    if (rawSkill) {
      filter['skills.name'] = new RegExp(`^${escapeRegex(rawSkill)}$`, 'i');
    }

    if (req.query.maxRate !== undefined && req.query.maxRate !== '') {
      const maxRate = Number(req.query.maxRate);
      if (!Number.isFinite(maxRate) || maxRate < 0) {
        return res.status(400).json({ success: false, message: 'Invalid maxRate filter' });
      }
      filter.hourlyRate = { $lte: maxRate };
    }

    if (req.query.workPreference && req.query.workPreference !== 'all') {
      const wp = String(req.query.workPreference).toLowerCase();
      if (!VALID_WORK_PREFS.has(wp)) {
        return res.status(400).json({ success: false, message: 'Invalid workPreference filter' });
      }
      filter.workPreference = wp;
    }

    if (req.query.availabilityStatus && req.query.availabilityStatus !== 'all') {
      const av = String(req.query.availabilityStatus).toLowerCase();
      if (!VALID_AVAILABILITY.has(av)) {
        return res.status(400).json({ success: false, message: 'Invalid availabilityStatus filter' });
      }
      filter.availabilityStatus = av;
    }

    const sortKey = SORT_MAP[req.query.sort] ? req.query.sort : 'relevance';

    const [data, totalCount] = await Promise.all([
      User.find(filter)
        .select(PUBLIC_FREELANCER_SELECT)
        .sort(SORT_MAP[sortKey])
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      page
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
