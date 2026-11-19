const express = require('express');
const mongoose = require('mongoose');
const Gig = require('../models/Gig');
const Escrow = require('../models/Escrow');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');
const AppError = require('../utils/AppError');
const withTransaction = require('../utils/withTransaction');
const { credit } = require('../utils/wallet');

// Merge params allows accessing :id (gigId) from parent router
const router = express.Router({ mergeParams: true });

// @desc    Add a milestone to an in-progress contract / gig
// @route   POST /api/gigs/:id/milestones
// @access  Private (Client owner or admin)
router.post('/', protect, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid gig ID format' });
        }

        const gig = await Gig.findById(req.params.id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to add milestones to this project' });
        }

        if (gig.status === 'completed' || gig.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Cannot add milestones to a completed or cancelled contract' });
        }

        const { title, budget, amount, checklist } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide a milestone title' });
        }

        const parsedBudget = Number(budget !== undefined ? budget : amount);
        if (isNaN(parsedBudget) || parsedBudget < 0) {
            return res.status(400).json({ success: false, message: 'Please provide a valid milestone budget' });
        }

        const newMilestone = {
            title: title.trim(),
            budget: parsedBudget,
            amount: parsedBudget,
            status: 'pending',
            checklist: Array.isArray(checklist) ? checklist : [{ text: 'Complete milestone deliverables', isCompleted: false }],
            deliverableUrl: '',
            deliverableNotes: '',
            revisionNotes: ''
        };

        gig.milestones.push(newMilestone);
        await gig.save();

        res.status(201).json({ 
            success: true, 
            message: 'Milestone added successfully', 
            data: gig 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Reorder milestones in a contract
// @route   PUT /api/gigs/:id/milestones/reorder
// @access  Private (Client owner or admin)
router.put('/reorder', protect, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid gig ID format' });
        }

        const gig = await Gig.findById(req.params.id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to reorder milestones' });
        }

        const { milestoneIds } = req.body;
        if (!Array.isArray(milestoneIds) || milestoneIds.length !== gig.milestones.length) {
            return res.status(400).json({ success: false, message: 'Invalid milestone IDs array provided' });
        }

        // Map existing milestones by ID string
        const milestoneMap = new Map();
        gig.milestones.forEach(m => milestoneMap.set(m._id.toString(), m));

        // Reconstruct array in specified order
        const reordered = [];
        for (const id of milestoneIds) {
            const m = milestoneMap.get(id);
            if (!m) {
                return res.status(400).json({ success: false, message: 'Milestone list mismatch' });
            }
            reordered.push(m);
        }

        gig.milestones = reordered;
        await gig.save();

        res.json({ 
            success: true, 
            message: 'Milestones reordered successfully', 
            data: gig 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Submit deliverable for a specific milestone
// @route   PUT /api/gigs/:id/milestones/:milestoneId/submit
// @access  Private (Assigned freelancer only)
router.put('/:milestoneId/submit', protect, async (req, res) => {
    try {
        const { id, milestoneId } = req.params;
        const { deliverableUrl, deliverableNotes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
            return res.status(400).json({ success: false, message: 'Invalid project or milestone ID format' });
        }

        const gig = await Gig.findById(id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig contract not found' });
        }

        // Must be the assigned freelancer
        if (!gig.freelancer || gig.freelancer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only the assigned developer can submit milestone deliverables' });
        }

        const milestone = gig.milestones.id(milestoneId);
        if (!milestone) {
            return res.status(404).json({ success: false, message: 'Milestone not found' });
        }

        if (milestone.status === 'completed') {
            return res.status(400).json({ success: false, message: 'This milestone has already been completed and approved' });
        }

        milestone.status = 'submitted';
        milestone.deliverableUrl = deliverableUrl || milestone.deliverableUrl || '';
        milestone.deliverableNotes = deliverableNotes || milestone.deliverableNotes || '';
        milestone.submittedAt = new Date();

        await gig.save();

        // Notify client
        sendNotification(
            req.app,
            gig.client,
            req.user._id,
            'milestone_submitted',
            'Milestone Work Submitted',
            `Freelancer submitted work for "${milestone.title}". Click to review deliverables.`,
            gig._id
        );

        res.json({
            success: true,
            message: 'Milestone work submitted for client review',
            data: gig
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Request revision on milestone submission
// @route   PUT /api/gigs/:id/milestones/:milestoneId/revision
// @access  Private (Client owner or admin)
router.put('/:milestoneId/revision', protect, async (req, res) => {
    try {
        const { id, milestoneId } = req.params;
        const { revisionNotes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        if (!revisionNotes || !revisionNotes.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide constructive feedback/notes for the revision' });
        }

        const gig = await Gig.findById(id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig contract not found' });
        }

        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to request revisions on this contract' });
        }

        const milestone = gig.milestones.id(milestoneId);
        if (!milestone) {
            return res.status(404).json({ success: false, message: 'Milestone not found' });
        }

        if (milestone.status !== 'submitted') {
            return res.status(400).json({ success: false, message: 'Revisions can only be requested on submitted milestones' });
        }

        milestone.status = 'revision_requested';
        milestone.revisionNotes = revisionNotes.trim();

        await gig.save();

        // Notify freelancer
        if (gig.freelancer) {
            sendNotification(
                req.app,
                gig.freelancer,
                req.user._id,
                'revision_requested',
                'Milestone Revision Requested',
                `Client requested revisions on "${milestone.title}": "${revisionNotes.slice(0, 80)}..."`,
                gig._id
            );
        }

        res.json({
            success: true,
            message: 'Revision request sent to developer',
            data: gig
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Toggle checklist item state inside milestone
// @route   PUT /api/gigs/:id/milestones/:milestoneId/checklist
// @access  Private (Client or assigned freelancer)
router.put('/:milestoneId/checklist', protect, async (req, res) => {
    try {
        const { id, milestoneId } = req.params;
        const { itemIndex, isCompleted } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        const gig = await Gig.findById(id);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        const isClient = gig.client.toString() === req.user._id.toString();
        const isFreelancer = gig.freelancer && gig.freelancer.toString() === req.user._id.toString();

        if (!isClient && !isFreelancer && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to modify milestone checklist' });
        }

        const milestone = gig.milestones.id(milestoneId);
        if (!milestone) {
            return res.status(404).json({ success: false, message: 'Milestone not found' });
        }

        if (itemIndex === undefined || !milestone.checklist[itemIndex]) {
            return res.status(400).json({ success: false, message: 'Invalid checklist item index' });
        }

        milestone.checklist[itemIndex].isCompleted = Boolean(isCompleted);
        await gig.save();

        res.json({ success: true, data: gig });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Approve milestone & release escrow to freelancer
// @route   PUT /api/gigs/:id/milestones/:milestoneId/approve
// @access  Private (Client owner or admin)
router.put('/:milestoneId/approve', protect, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.milestoneId)) {
        throw new AppError('Invalid project or milestone ID format', 400);
    }

    const out = await withTransaction(async (session) => {
        const gig = await Gig.findById(req.params.id).session(session);
        if (!gig) throw new AppError('Gig contract not found', 404);

        if (gig.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            throw new AppError('Not authorized to approve milestones for this project', 403);
        }

        if (!gig.freelancer) {
            throw new AppError('No freelancer assigned to this contract', 400);
        }

        const milestone = gig.milestones.id(req.params.milestoneId);
        if (!milestone) throw new AppError('Milestone not found', 404);

        if (milestone.status === 'completed') {
            throw new AppError('Milestone has already been approved and paid', 400);
        }

        const amountToRelease = Number(milestone.budget || milestone.amount || 0);
        if (amountToRelease <= 0) {
            throw new AppError('Milestone amount must be greater than zero to release payment', 400);
        }

        const escrow = await Escrow.findOne({ gig: gig._id, status: 'held' }).session(session);
        if (!escrow || escrow.amount < amountToRelease) {
            throw new AppError(
                `No active escrow; milestone was not approved. Required: ₹${amountToRelease}, Held: ₹${escrow ? escrow.amount : 0}`,
                409
            );
        }

        escrow.amount -= amountToRelease;
        if (escrow.amount <= 0) {
            escrow.status = 'released';
        }
        await escrow.save({ session });

        await credit(gig.freelancer, amountToRelease, {
            type: 'milestone_release',
            description: `Payment for milestone: "${milestone.title}" on project "${gig.title}"`,
            referenceId: gig._id,
            session
        });

        milestone.status = 'completed';
        milestone.completedAt = new Date();

        const allDone = gig.milestones.length > 0 && gig.milestones.every(m => m.status === 'completed');
        if (allDone) {
            gig.status = 'completed';
            gig.completedAt = new Date();
        }

        await gig.save({ session });

        return { gig, milestone, released: amountToRelease, allDone };
    });

    sendNotification(
        req.app,
        out.gig.freelancer,
        req.user._id,
        'milestone_approved',
        'Milestone Approved & Paid!',
        `"${out.milestone.title}" approved, ₹${out.released.toLocaleString('en-IN')} released.`,
        out.gig._id
    );

    res.json({ success: true, data: out.gig });
});

module.exports = router;
