const { rateLimit } = require('express-rate-limit');

const ALLOWED_ORIGINS = new Set([
  'https://weather.randelldawson.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function restrictOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // Browsers may omit Origin on same-origin GET requests.
  // Check Referer when available, but do not mistake either header for authentication.
  const referer = req.get('Referer');
  if (referer) {
    try {
      if (!ALLOWED_ORIGINS.has(new URL(referer).origin)) {
        return res.status(403).json({ error: 'Referer not allowed' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid Referer' });
    }
  }

  // Deny cross-site script/form fetch metadata when the browser provides it.
  if (req.get('Sec-Fetch-Site') === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site requests not allowed' });
  }
  next();
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

module.exports = { restrictOrigin, apiLimiter };
