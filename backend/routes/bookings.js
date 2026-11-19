const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const withTransaction = require('../utils/withTransaction');
const AppError = require('../utils/AppError');
const { timeRange, bookingDate: parseBookingDate } = require('../utils/bookingValidation');
const { protect, authorize, requireVerifiedEmail } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');

const router = express.Router();

// @desc    Update freelancer's availability slots
// @route   PUT /api/bookings/availability
// @access  Private (Freelancers only with verified email)
router.put('/availability', protect, authorize('freelancer', 'admin'), requireVerifiedEmail, async (req, res, next) => {
    try {
        if (req.user.role !== 'freelancer' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only freelancers can update availability slots' });
        }

        const { slots } = req.body;

        if (!slots || !Array.isArray(slots)) {
            return res.status(400).json({ success: false, message: 'Please provide an array of availability slots' });
        }

        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (slots.length > 100) throw new AppError('Maximum 100 availability slots', 400);
        const normalized = slots.map(slot => {
            if (!slot || !validDays.includes(slot.dayOfWeek)) throw new AppError('Invalid day of week', 400);
            return { dayOfWeek: slot.dayOfWeek, ...timeRange(slot.startTime, slot.endTime) };
        });

        const user = await User.findById(req.user._id);
        user.availabilitySlots = normalized;
        await user.save();

        res.status(200).json({ success: true, message: 'Availability slots updated successfully', data: user.availabilitySlots });
    } catch (error) {
        return next(error);
    }
});

// @desc    Create a new booking reservation slot
// @route   POST /api/bookings
// @access  Private (Clients only with verified email)
router.post('/', protect, authorize('client', 'admin'), requireVerifiedEmail, async (req, res, next) => {
    try {
        if (req.user.role !== 'client' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only clients can request bookings' });
        }

        const { freelancerId, date, startTime: start, endTime: end, description } = req.body;
        const { startTime, endTime } = timeRange(start, end);
        const bookingDate = parseBookingDate(date);
        if (typeof description !== 'string' || !description.trim() || description.length > 300) throw new AppError('Description must contain 1 to 300 characters', 400);

        if (!freelancerId || !date || !startTime || !endTime || !description) {
            return res.status(400).json({ success: false, message: 'Please provide all booking details (freelancerId, date, startTime, endTime, description)' });
        }

        if (!mongoose.Types.ObjectId.isValid(freelancerId)) {
            return res.status(400).json({ success: false, message: 'Invalid freelancer ID format' });
        }

        if (freelancerId.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot book a session with yourself' });
        }

        const booking = await withTransaction(async session => {
            // Serialize reservations for this freelancer across every API process.
            // A retry sees the booking committed by the winner before checking overlap.
            const freelancer = await User.findOneAndUpdate(
                { _id: freelancerId, role: 'freelancer', isSuspended: { $ne: true } },
                { $inc: { bookingRevision: 1 } },
                { session, returnDocument: 'after' }
            );
            if (!freelancer) throw new AppError('Freelancer not found', 404);
            const existing = await Booking.find({
                freelancer: freelancerId, date: bookingDate,
                status: { $in: ['pending', 'confirmed'] }
            }).session(session);
            const conflict = existing.some(b => {
                const range = timeRange(b.startTime, b.endTime);
                return startTime < range.endTime && endTime > range.startTime;
            });
            if (conflict) throw new AppError('This time slot is already booked or requested on this date.', 409);
            const [created] = await Booking.create([{
                freelancer: freelancerId, client: req.user._id, date: bookingDate,
                startTime, endTime, description: description.trim()
            }], { session });
            return created;
        });

        // Notify Freelancer
        try {
            sendNotification(
                req.app,
                freelancerId,
                req.user._id,
                'booking_request',
                'New Booking Request!',
                `Client ${req.user.username} has requested a slot on ${bookingDate.toLocaleDateString()} at ${startTime}-${endTime}.`,
                booking._id
            );
        } catch (notifErr) {
            console.error('Failed to notify freelancer of booking:', notifErr.message);
        }

        res.status(201).json({ success: true, message: 'Booking requested successfully', data: booking });
    } catch (error) {
        return next(error);
    }
});

// @desc    Get bookings of the logged-in user
// @route   GET /api/bookings/my-bookings
// @access  Private
router.get('/my-bookings', protect, async (req, res, next) => {
    try {
        let bookings;

        if (req.user.role === 'freelancer') {
            bookings = await Booking.find({ freelancer: req.user._id })
                .populate('client', 'username email bio')
                .sort({ date: 1, startTime: 1 });
        } else if (req.user.role === 'client') {
            bookings = await Booking.find({ client: req.user._id })
                .populate('freelancer', 'username email bio verificationBadge')
                .sort({ date: 1, startTime: 1 });
        } else {
            // Admin can see all bookings
            bookings = await Booking.find()
                .populate('client', 'username')
                .populate('freelancer', 'username')
                .sort({ date: 1, startTime: 1 });
        }

        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        return next(error);
    }
});

// @desc    Update booking reservation status (Accept/Reject/Cancel/Complete)
// @route   PUT /api/bookings/:id/status
// @access  Private
router.put('/:id/status', protect, async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!status || !['confirmed', 'cancelled', 'completed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid status update (confirmed, cancelled, completed)' });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID format' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Enforce valid status transition: already completed or cancelled bookings cannot be changed
        if (booking.status === 'completed' || booking.status === 'cancelled') {
            return res.status(400).json({ success: false, message: `Cannot modify a booking that is already ${booking.status}` });
        }

        // Authorization checks
        if (status === 'confirmed' || (status === 'cancelled' && req.user.role === 'freelancer')) {
            // Only the assigned freelancer can accept/reject the booking request
            if (booking.freelancer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Forbidden: Not authorized to accept or decline this booking' });
            }
        }

        if (status === 'completed' || (status === 'cancelled' && req.user.role === 'client')) {
            // Only the hiring client can cancel their request or mark the booking session as complete
            if (booking.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Forbidden: Not authorized to cancel or complete this booking' });
            }
        }

        const claimed = await Booking.findOneAndUpdate(
            { _id: booking._id, status: booking.status },
            { $set: { status } }, { returnDocument: 'after', runValidators: true }
        );
        if (!claimed) throw new AppError('Booking changed, reload before retrying', 409);
        booking.status = claimed.status;

        // Send real-time notification to the relevant parties
        try {
            const targets = [];
            if (req.user.role === 'admin') {
                targets.push(booking.freelancer, booking.client);
            } else if (req.user.role === 'client') {
                targets.push(booking.freelancer);
            } else {
                targets.push(booking.client);
            }

            for (const targetUser of targets) {
                sendNotification(
                    req.app,
                    targetUser,
                    req.user._id,
                    'booking_update',
                    `Booking Request ${status.toUpperCase()}!`,
                    `Booking on ${new Date(booking.date).toLocaleDateString()} at ${booking.startTime}-${booking.endTime} has been marked as ${status} by ${req.user.username}.`,
                    booking._id
                );
            }
        } catch (notifErr) {
            console.error('Failed to send booking update notification:', notifErr.message);
        }

        res.status(200).json({ success: true, message: `Booking status updated to ${status}`, data: booking });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
