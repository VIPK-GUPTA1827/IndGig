const express = require('express');
const mongoose = require('mongoose');
const Gig = require('../models/Gig');
const User = require('../models/User');
const Escrow = require('../models/Escrow');
const Proposal = require('../models/Proposal');
const Transaction = require('../models/Transaction');
const { protect, authorize, requireVerifiedEmail, optionalAuth } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');
const Review = require('../models/Review');
const { calculateSimilarity } = require('../utils/aiMatcher');
const AppError = require('../utils/AppError');
const withTransaction = require('../utils/withTransaction');
const { credit } = require('../utils/wallet');
const validate = require('../middleware/validate');
const { createGigSchema } = require('../validators/gig');
const { getPagination } = require('../utils/paginate');
const { cacheMiddleware, clearCache } = require('../config/redis');

const router = express.Router();

// Safe utility to escape user search terms and skill tags in regular expressions
const escapeRegex = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const rateLimit = require('express-rate-limit');

// Rate limiter for gig creation: prevent project creation spam
const createGigLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test-rate-limit' ? 3 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        success: false,
        message: 'Too many projects created recently. Please wait a minute before posting again.'
    }
});

// @desc    Create a new gig
// @route   POST /api/gigs
// @access  Private (Clients only with verified email)
router.post('/', createGigLimiter, protect, authorize('client', 'admin'), requireVerifiedEmail, validate({ body: createGigSchema }), async (req, res) => {
    try {
        // Ensure user is a client (or allow admin to post)
        if (req.user.role !== 'client' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only clients can post gigs' });
        }

        const { 
            title, 
            description, 
            category, 
            budget, 
            coordinates, 
            address, 
            milestones, 
            documents,
            skillsRequired,
            locationType,
            experienceLevel,
            duration,
            deadline,
            status
        } = req.body;

        const isDraft = status === 'draft';

        // Validation for project
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide a project title' });
        }

        if (!isDraft) {
            if (!description || description.trim().length < 10) {
                return res.status(400).json({ success: false, message: 'Please provide a detailed project description (minimum 10 characters)' });
            }
            if (!category || !category.trim()) {
                return res.status(400).json({ success: false, message: 'Please select a project category' });
            }
            const numBudget = Number(budget);
            if (isNaN(numBudget) || numBudget <= 0) {
                return res.status(400).json({ success: false, message: 'Please specify a valid budget in INR (₹)' });
            }
        }

        // Coordinates handling: if remote or not provided, fallback to Mumbai default
        let resolvedCoords = [72.8777, 19.0760];
        if (coordinates && Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
            resolvedCoords = [parseFloat(coordinates[0]), parseFloat(coordinates[1])];
        }

        // Skills sanitization
        let normalizedSkills = [];
        if (Array.isArray(skillsRequired)) {
            normalizedSkills = skillsRequired.map(s => String(s).trim()).filter(Boolean);
        } else if (typeof skillsRequired === 'string') {
            normalizedSkills = skillsRequired.split(',').map(s => s.trim()).filter(Boolean);
        }

        const gig = await Gig.create({
            title: title.trim(),
            description: description ? description.trim() : 'Draft project outline',
            category: category ? category.trim() : 'Web Development',
            budget: budget !== undefined && !isNaN(Number(budget)) ? Number(budget) : 0,
            client: req.user._id,
            skillsRequired: normalizedSkills,
            locationType: locationType && ['remote', 'onsite', 'hybrid'].includes(locationType) ? locationType : 'remote',
            experienceLevel: experienceLevel && ['Entry', 'Intermediate', 'Expert'].includes(experienceLevel) ? experienceLevel : 'Intermediate',
            duration: duration || '1-4 weeks',
            deadline: deadline ? new Date(deadline) : null,
            status: isDraft ? 'draft' : 'open',
            location: {
                type: 'Point',
                coordinates: resolvedCoords
            },
            address: address ? address.trim() : (locationType === 'onsite' ? 'Mumbai, Maharashtra' : 'Remote / Online'),
            milestones: milestones || [],
            documents: documents || []
        });

        // Invalidate cached gigs list so new gigs appear immediately
        clearCache('cache:/api/gigs').catch(() => {});

        // Trigger notifications to all freelancers only if published as open
        if (!isDraft) {
            try {
                const freelancers = await User.find({ role: 'freelancer' });
                freelancers.forEach(free => {
                    sendNotification(
                        req.app,
                        free._id,
                        req.user._id,
                        'new_gig',
                        'New Gig Posted!',
                        `A new gig "${title}" has been posted in category "${category}" with a budget of ₹${Number(budget).toLocaleString('en-IN')}.`,
                        gig._id,
                        { email: false }
                    );
                });
            } catch (notifErr) {
                console.error('Failed to dispatch new gig notifications:', notifErr.message);
            }
        }

        res.status(201).json({ 
            success: true, 
            message: isDraft ? 'Project saved as draft successfully' : 'Project published successfully',
            data: gig 
        });
    } catch (error) {
        console.error('Error in POST /api/gigs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get all gigs posted by current client with proposal counts
// @route   GET /api/gigs/client/my-gigs
// @access  Private (Clients only)
router.get('/client/my-gigs', protect, authorize('client', 'admin'), async (req, res) => {
    try {
        const gigs = await Gig.find({ client: req.user._id })
            .populate('freelancer', 'name username avatar email')
            .sort({ createdAt: -1 });

        // Augment each gig with real proposal counts from MongoDB
        const augmentedGigs = await Promise.all(
            gigs.map(async (gig) => {
                const gigObj = gig.toObject();
                const proposalCount = await Proposal.countDocuments({ gig: gig._id });
                const acceptedProposal = await Proposal.findOne({ gig: gig._id, status: 'accepted' })
                    .populate('freelancer', 'name username avatar email headline');
                
                gigObj.proposalCount = proposalCount;
                gigObj.acceptedProposal = acceptedProposal;
                return gigObj;
            })
        );

        res.status(200).json({
            success: true,
            count: augmentedGigs.length,
            data: augmentedGigs
        });
    } catch (error) {
        console.error('Error fetching client gigs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get all active and completed contracts assigned to current freelancer
// @route   GET /api/gigs/freelancer/my-contracts
// @access  Private (Freelancers only)
router.get('/freelancer/my-contracts', protect, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only freelancers can view assigned contracts' });
        }

        const contracts = await Gig.find({
            freelancer: req.user._id,
            status: { $in: ['in-progress', 'completed', 'disputed'] }
        })
        .populate('client', 'name username avatar email')
        .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, count: contracts.length, data: contracts });
    } catch (error) {
        console.error('Error fetching freelancer contracts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Search for hyperlocal gigs near coordinates
// @route   GET /api/gigs/search
// @access  Public
router.get('/search', async (req, res) => {
    try {
        const { lng, lat, maxDistance, category, search, minBudget, maxBudget } = req.query;

        if (!lng || !lat) {
            return res.status(400).json({ success: false, message: 'Please provide longitude (lng) and latitude (lat) query params' });
        }

        const parsedLng = parseFloat(lng);
        const parsedLat = parseFloat(lat);
        if (isNaN(parsedLng) || isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
            return res.status(400).json({ success: false, message: 'Invalid longitude or latitude coordinates' });
        }

        // Default maxDistance to 5000 meters (5 km) if not specified
        const distanceLimit = maxDistance ? parseInt(maxDistance, 10) : 5000;

        // Query setup using MongoDB $near geospatial query
        let query = {
            status: 'open',
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parsedLng, parsedLat] // [lng, lat]
                    },
                    $maxDistance: distanceLimit // in meters
                }
            }
        };

        // Optional category filter
        if (category) {
            query.category = category;
        }

        // Search keyword filter
        if (search && search.trim()) {
            const escapedSearch = escapeRegex(search.trim());
            query.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
                { description: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        // Budget filters
        if (minBudget || maxBudget) {
            query.budget = {};
            if (minBudget) query.budget.$gte = parseFloat(minBudget);
            if (maxBudget) query.budget.$lte = parseFloat(maxBudget);
        }

        const gigs = await Gig.find(query).populate('client', 'username name avatar');

        res.status(200).json({ success: true, count: gigs.length, data: gigs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get all gigs
// @route   GET /api/gigs
// @access  Public (Cached for 15 seconds to support high concurrency)
router.get('/', cacheMiddleware(15), async (req, res) => {
    try {
        const { category, status, search, minBudget, maxBudget, skills, isReal, isDemo } = req.query;
        const andConditions = [];

        // Status filter: defaults to 'open', drafts must NEVER leak into public/freelancer browse
        if (status === 'draft') {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }
        if (status && status !== 'all') {
            andConditions.push({ status });
        } else if (status === 'all') {
            andConditions.push({ status: { $ne: 'draft' } });
        } else {
            andConditions.push({ status: 'open' });
        }

        // Real vs Demo filter
        if (isReal === 'true') {
            andConditions.push({ isDemo: { $ne: true }, isSample: { $ne: true } });
        } else if (isDemo === 'true') {
            andConditions.push({ $or: [{ isDemo: true }, { isSample: true }] });
        }

        // Category filter
        if (category && category !== 'All') {
            andConditions.push({ category });
        }

        // Search keyword filter across title and description
        if (search && search.trim()) {
            const sRegex = new RegExp(escapeRegex(search.trim()), 'i');
            andConditions.push({
                $or: [
                    { title: sRegex },
                    { description: sRegex }
                ]
            });
        }

        // Skills filter across skillsRequired array
        if (skills && skills.trim()) {
            const skillTokens = skills.split(',').map(s => s.trim()).filter(Boolean);
            if (skillTokens.length > 0) {
                const skillRegexes = skillTokens.map(s => new RegExp(escapeRegex(s), 'i'));
                andConditions.push({ skillsRequired: { $in: skillRegexes } });
            }
        }

        // Budget filters
        if (minBudget || maxBudget) {
            const budgetFilter = {};
            if (minBudget) budgetFilter.$gte = parseFloat(minBudget);
            if (maxBudget) budgetFilter.$lte = parseFloat(maxBudget);
            andConditions.push({ budget: budgetFilter });
        }

        const filter = andConditions.length > 0 ? { $and: andConditions } : {};

        const SORT_MAP = {
            newest: { createdAt: -1 },
            budget_asc: { budget: 1 },
            budget_desc: { budget: -1 }
        };
        const sortKey = (req.query.sort || 'newest').toLowerCase();
        const sortSpec = SORT_MAP[sortKey] || SORT_MAP.newest;

        const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20, maxLimit: 50 });

        const totalCount = await Gig.countDocuments(filter);

        const gigs = await Gig.find(filter)
            .populate('client', 'username name avatar')
            .populate('freelancer', 'username name avatar')
            .sort(sortSpec)
            .skip(skip)
            .limit(limit);

        res.status(200).json({ 
            success: true, 
            count: gigs.length, 
            totalCount,
            page,
            totalPages: Math.max(1, Math.ceil(totalCount / limit)),
            data: gigs 
        });
    } catch (error) {
        console.error('Error in GET /api/gigs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get single gig by ID
// @route   GET /api/gigs/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid gig ID format' });
        }

        const gig = await Gig.findById(req.params.id)
            .populate('client', 'username name avatar')
            .populate('freelancer', 'username name avatar');

        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        const isOwner = req.user && (
            req.user.role === 'admin' ||
            (gig.client && (gig.client._id ? gig.client._id.toString() : gig.client.toString()) === req.user._id.toString())
        );

        if (gig.status === 'draft' && !isOwner) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        res.status(200).json({ success: true, data: gig });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Update a gig
// @route   PUT /api/gigs/:id
// @access  Private (Owner only)
router.put('/:id', protect, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid gig ID format' });
        }

        let gig = await Gig.findById(req.params.id);

        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        // Strict ownership check: Only the client who created the gig (or admin) can update it
        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not own this project' });
        }

        const { 
            title, 
            description, 
            category, 
            budget, 
            coordinates, 
            address, 
            status, 
            milestones,
            skillsRequired,
            locationType,
            experienceLevel,
            duration,
            deadline
        } = req.body;

        // Lifecycle (in_progress, completed, cancelled) only via dedicated endpoints
        // Contract shuru hone ke baad edit band
        if (!['draft', 'open'].includes(gig.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot edit a project that is ${gig.status}`
            });
        }

        const ALLOWED_EDIT_STATUSES = ['draft', 'open'];
        if (status !== undefined && !ALLOWED_EDIT_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status can only be changed to "draft" or "open" from here'
            });
        }

        const wasDraft = gig.status === 'draft';
        const targetStatus = status || gig.status;

        // If publishing a draft or keeping open, ensure core required fields are valid
        if (targetStatus === 'open') {
            const checkTitle = title !== undefined ? title : gig.title;
            const checkDesc = description !== undefined ? description : gig.description;
            const checkBudget = budget !== undefined ? budget : gig.budget;

            if (!checkTitle || !checkTitle.trim()) {
                return res.status(400).json({ success: false, message: 'Project title cannot be empty' });
            }
            if (!checkDesc || checkDesc.trim().length < 10) {
                return res.status(400).json({ success: false, message: 'Description must be at least 10 characters' });
            }
            if (!checkBudget || Number(checkBudget) <= 0) {
                return res.status(400).json({ success: false, message: 'Budget must be greater than 0 INR (₹)' });
            }
        }

        const updateData = {
            title: title !== undefined ? title.trim() : gig.title,
            description: description !== undefined ? description.trim() : gig.description,
            category: category !== undefined ? category.trim() : gig.category,
            budget: budget !== undefined ? Number(budget) : gig.budget,
            status: targetStatus,
            address: address !== undefined ? address.trim() : gig.address,
            milestones: Array.isArray(milestones)
                ? milestones.map((m) => ({
                    title: String(m.title || '').slice(0, 100),
                    amount: Number(m.amount) || 0,
                    budget: Number(m.amount) || 0,
                    description: String(m.description || '').slice(0, 1000),
                    status: 'pending'
                }))
                : gig.milestones,
            locationType: locationType && ['remote', 'onsite', 'hybrid'].includes(locationType) ? locationType : gig.locationType,
            experienceLevel: experienceLevel && ['Entry', 'Intermediate', 'Expert'].includes(experienceLevel) ? experienceLevel : gig.experienceLevel,
            duration: duration !== undefined ? duration : gig.duration,
            deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : gig.deadline
        };

        if (skillsRequired !== undefined) {
            if (Array.isArray(skillsRequired)) {
                updateData.skillsRequired = skillsRequired.map(s => String(s).trim()).filter(Boolean);
            } else if (typeof skillsRequired === 'string') {
                updateData.skillsRequired = skillsRequired.split(',').map(s => s.trim()).filter(Boolean);
            }
        }

        // If location coordinates are updated
        if (coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
            updateData.location = {
                type: 'Point',
                coordinates: [parseFloat(coordinates[0]), parseFloat(coordinates[1])]
            };
        }

        gig = await Gig.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

        // If transitioning from draft to open, notify freelancers
        if (wasDraft && targetStatus === 'open') {
            try {
                const freelancers = await User.find({ role: 'freelancer' });
                freelancers.forEach(free => {
                    sendNotification(
                        req.app,
                        free._id,
                        req.user._id,
                        'new_gig',
                        'New Gig Published!',
                        `A newly published gig "${gig.title}" is now open for proposals with a budget of ₹${Number(gig.budget).toLocaleString('en-IN')}.`,
                        gig._id,
                        { email: false }
                    );
                });
            } catch (notifErr) {
                console.error('Failed to notify freelancers of published draft:', notifErr.message);
            }
        }

        res.status(200).json({ 
            success: true, 
            message: targetStatus === 'draft' ? 'Draft saved' : (wasDraft && targetStatus === 'open' ? 'Project published!' : 'Project updated successfully'),
            data: gig 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Delete a gig
// @route   DELETE /api/gigs/:id
// @access  Private (Owner only)
router.delete('/:id', protect, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid gig ID format' });
        }

        const gig = await Gig.findById(req.params.id);

        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        // Strict ownership check
        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not own this project' });
        }

        // Prevent deleting active projects with locked escrow, active contracts, or ongoing disputes
        if (gig.status === 'in-progress' || gig.status === 'disputed') {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete a project that is currently ${gig.status}.` 
            });
        }

        // Cascade delete any proposals submitted for this gig
        await Proposal.deleteMany({ gig: req.params.id });

        await Gig.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: 'Gig deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Complete a gig and release remaining escrow funds
// @route   PUT /api/gigs/:id/complete
// @access  Private (Client only)
router.put('/:id/complete', protect, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gig ID format'
        });
    }

    const isAdmin = req.user.role === 'admin';
    const out = await withTransaction(async (session) => {
        // 1. Claim: sirf in-progress, sirf owner (ya admin)
        const gig = await Gig.findOneAndUpdate(
            {
                _id: req.params.id,
                status: 'in-progress',
                ...(isAdmin ? {} : { client: req.user._id })
            },
            {
                $set: {
                    status: 'completed',
                    'milestones.$[].status': 'completed'
                }
            },
            { returnDocument: 'after', session }
        );
        if (!gig) {
            throw new AppError('Gig not found or not in-progress', 409);
        }

        // 2. Escrow ka bacha paisa release
        const escrow = await Escrow.findOne({
            gig: gig._id,
            status: { $in: ['held', 'partially-released'] }
        }).session(session);

        if (!escrow) throw new AppError('No active escrow', 404);

        const remaining = Math.max(0, escrow.amount - escrow.releasedAmount);
        escrow.releasedAmount = escrow.amount;
        escrow.status = 'released';
        await escrow.save({ session });

        if (remaining > 0) {
            await credit(gig.freelancer, remaining, session);
            await Transaction.create([{
                user: gig.freelancer,
                type: 'release',
                amount: remaining,
                description: `Escrow payout for "${gig.title}"`,
                referenceId: gig._id
            }], { session });
        }

        return { gig, remaining };
    });

    sendNotification(
        req.app,
        out.gig.freelancer,
        req.user._id,
        'proposal_accepted',
        'Gig Completed!',
        `"${out.gig.title}" completed. ₹${out.remaining.toLocaleString('en-IN')} released.`,
        out.gig._id
    );

    res.json({ success: true, data: out.gig });
});

// Milestone Sub-Router (modularized under RealWorld architecture standard)
router.use('/:id/milestones', require('./milestones'));

// @desc    Get trending skills based on active/open gigs analysis
// @route   GET /api/gigs/analytics/trending-skills
// @access  Public
router.get('/analytics/trending-skills', async (req, res) => {
    try {
        const gigs = await Gig.find({ status: { $in: ['open', 'in-progress', 'completed'] } });
        const popularSkillsList = ['React', 'Node', 'Python', 'Figma', 'UI Design', 'Javascript', 'Flutter', 'Android', 'AWS', 'Docker', 'SQL', 'HTML', 'CSS', 'MongoDB', 'PostgreSQL'];
        const skillCounts = {};
        popularSkillsList.forEach(skill => { skillCounts[skill] = 0; });
        
        gigs.forEach(g => {
            const combinedText = `${g.title} ${g.category} ${g.description}`.toLowerCase();
            popularSkillsList.forEach(skill => {
                if (combinedText.includes(skill.toLowerCase())) {
                    skillCounts[skill]++;
                }
            });
        });
        
        const trendingSkills = Object.keys(skillCounts)
            .map(skill => ({ name: skill, count: skillCounts[skill] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.status(200).json({ success: true, data: trendingSkills });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get AI recommended gigs for the logged-in freelancer
// @route   GET /api/gigs/recommendations/me
// @access  Private (Freelancers only)
router.get('/recommendations/me', protect, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only freelancers can get gig recommendations' });
        }

        const user = await User.findById(req.user._id);
        if (!user || !user.skills || user.skills.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const freelancerSkillsText = (user.skills || [])
            .map(s => (typeof s === 'string' ? s : (s?.name || '')))
            .filter(Boolean)
            .join(', ') + ' ' + (user.bio || '');

        // Find all open gigs
        const gigs = await Gig.find({ status: 'open' }).populate('client', 'username');
        if (gigs.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const gigTexts = gigs.map(g => `${g.title} ${g.category} ${g.description}`);

        const scores = await calculateSimilarity(freelancerSkillsText, gigTexts);

        // Map and sort gigs
        const recommendedGigs = gigs.map((gig, index) => {
            const matchPercentage = Math.round((scores[index] || 0) * 100);
            return {
                gig,
                matchPercentage
            };
        })
        .sort((a, b) => b.matchPercentage - a.matchPercentage)
        // Only return matches above 15% to keep recommendations relevant
        .filter(item => item.matchPercentage >= 15);

        res.status(200).json({ success: true, count: recommendedGigs.length, data: recommendedGigs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Get AI recommended candidates for a client's gig
// @route   GET /api/gigs/:id/recommendations
// @access  Private (Clients only)
router.get('/:id/recommendations', protect, async (req, res) => {
    try {
        const gig = await Gig.findById(req.params.id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        // Ensure user is the client who posted the gig
        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized to view recommendations for this gig' });
        }

        const freelancers = await User.find({ role: 'freelancer', isSuspended: { $ne: true } });
        if (freelancers.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const gigText = `${gig.title} ${gig.category} ${gig.description}`;
        const freelancerTexts = freelancers.map(f => {
            const skillList = (f.skills || [])
                .map(s => (typeof s === 'string' ? s : (s?.name || '')))
                .filter(Boolean)
                .join(', ');
            return `${skillList} ${f.headline || ''} ${f.bio || ''}`.trim();
        });

        const scores = await calculateSimilarity(gigText, freelancerTexts);

        // Map recommendations with rating and badge score boosters
        const recommendationsPromises = freelancers.map(async (freelancer, index) => {
            const baseScore = scores[index] || 0;

            // Fetch average rating
            const reviews = await Review.find({ reviewee: freelancer._id });
            const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;

            // Boost score: rating multiplier up to +50%, verified badge +10%
            const ratingBoost = 1 + (avgRating / 10);
            const badgeBoost = freelancer.verificationBadge ? 1.1 : 1.0;
            const finalScore = Math.min(1, baseScore * ratingBoost * badgeBoost);

            const matchPercentage = Math.round(finalScore * 100);

            return {
                freelancer: {
                    _id: freelancer._id,
                    username: freelancer.username,
                    email: freelancer.email,
                    bio: freelancer.bio,
                    skills: freelancer.skills,
                    verificationBadge: freelancer.verificationBadge,
                    rating: parseFloat(avgRating.toFixed(1))
                },
                matchPercentage
            };
        });

        const recommendations = await Promise.all(recommendationsPromises);

        // Sort descending, filter relevant ones (match >= 15%)
        const filteredRecommendations = recommendations
            .sort((a, b) => b.matchPercentage - a.matchPercentage)
            .filter(item => item.matchPercentage >= 15);

        res.status(200).json({ success: true, count: filteredRecommendations.length, data: filteredRecommendations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
