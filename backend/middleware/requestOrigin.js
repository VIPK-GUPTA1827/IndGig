const { allowedOrigins } = require('../config/cors');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CORS response headers alone do not stop a browser from submitting a write.
// Cookie-authenticated writes must carry a trusted Origin (or Referer fallback).
module.exports = function requestOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  const trusted = value => allowedOrigins.includes(value);
  if (origin) {
    if (trusted(origin)) return next();
    return res.status(403).json({
      success: false, message: 'Untrusted request origin'
    });
  }
  if (req.cookies?.token || req.cookies?.refreshToken) {
    let refererOrigin;
    try {
      refererOrigin = new URL(req.get('referer')).origin;
    } catch { /* absent/invalid */ }
    if (!trusted(refererOrigin)) {
      return res.status(403).json({
        success: false,
        message: 'Trusted origin required for cookie-authenticated writes'
      });
    }
  }
  next();
};
