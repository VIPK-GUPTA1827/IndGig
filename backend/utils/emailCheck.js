// utils/emailCheck.js
// Strict email check: Only allowed trusted email providers, zero suggestions, zero fake emails

const ALLOWED_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'yahoo.in',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'zoho.com',
  'proton.me'
]);

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkEmail(rawEmail) {
  const bad = { ok: false, message: 'Invalid email address' };
  if (typeof rawEmail !== 'string') return bad;
  const email = rawEmail.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_FORMAT.test(email)) return bad;

  const [localPart, domain] = email.split('@');

  // Strict domain whitelist
  if (!ALLOWED_DOMAINS.has(domain)) {
    return {
      ok: false,
      message: 'Please use a valid email'
    };
  }

  return { ok: true, email };
}

module.exports = { checkEmail, ALLOWED_DOMAINS };
