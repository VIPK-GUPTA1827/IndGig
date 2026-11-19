const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const SAFE_SELECT = '-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire';

const getToken = (req) => {
  if (req.cookies && req.cookies.token) return req.cookies.token;
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.split(' ')[1];
  return null;
};

const protectSession = async (req, res, next) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, please log in'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id)) throw new Error('Invalid subject');
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: expired ? 'Session expired' : 'Invalid token'
    });
  }

  const user = await User.findById(decoded.id).select(SAFE_SELECT);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'User no longer exists'
    });
  }

  if (user.isSuspended) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been suspended.'
    });
  }

  if ((decoded.v || 0) !== (user.tokenVersion || 0)) {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_REVOKED',
      message: 'Session ended, please log in again'
    });
  }

  req.user = user;
  next();
};

// Default for all private API routes: email ownership is mandatory.
const protect = (req, res, next) => protectSession(req, res, () => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false, requiresVerification: true,
      email: req.user.email,
      message: 'Verify your email address before opening your workspace.'
    });
  }
  next();
});

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to ${roles.join(' or ')} accounts only. Your role is '${req.user.role}'.`
      });
    }
    next();
  };
};

// Email verification enforcement middleware
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
  }
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      requiresVerification: true,
      message: 'Email verification required. Please verify your email address to access this workspace.'
    });
  }
  next();
};

// Optional auth middleware
const optionalAuth = async (req, res, next) => {
  const token = getToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id)) throw new Error('Invalid subject');
      const user = await User.findById(decoded.id).select(SAFE_SELECT);
      if (user && user.isEmailVerified && !user.isSuspended && (decoded.v || 0) === (user.tokenVersion || 0)) {
        req.user = user;
      }
    } catch (error) {
      // Token invalid or expired - proceed as unauthenticated guest
    }
  }
  next();
};

module.exports = { protect, protectSession, authorize, requireVerifiedEmail, optionalAuth };
