const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

function createLimiter({ windowMs, limit, message, skipSuccessfulRequests = false, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator && { keyGenerator }),
    skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
    handler: (req, res) => res.status(429).json({ error: 'TOO_MANY_REQUESTS', message }),
  });
}

const ONE_MINUTE = 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Failed logins only: a successful login never counts against a real user.
const loginLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const registerLimiter = createLimiter({
  windowMs: ONE_HOUR,
  limit: 10,
  message: 'Too many sign-ups from this address. Please try later.',
});

const passwordResetLimiter = createLimiter({
  windowMs: ONE_HOUR,
  limit: 5,
  message: 'Too many reset requests. Please try later.',
});

// Issues Report 21: generous, so autocomplete never hits it. Used from Phase 4.
const browseLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 500,
  message: 'Please slow down.',
});

const writeLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 30,
  message: 'Too many requests. Please slow down.',
});

// Stock reservations: keyed per customer when logged in, per IP otherwise.
// The factory lets tests build a tiny limiter instead of sending many requests.
const createReserveLimiter = ({ limit = Number(process.env.RESERVE_RATE_LIMIT) || 10 } = {}) =>
  createLimiter({
    windowMs: ONE_MINUTE,
    limit,
    message: 'Too many reservation attempts. Please wait a minute.',
    keyGenerator: (req) =>
      req.user ? `customer:${req.user.userId ?? req.user.id}` : ipKeyGenerator(req.ip),
  });

const reserveLimiter = createReserveLimiter();

module.exports = {
  createLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  browseLimiter,
  writeLimiter,
  createReserveLimiter,
  reserveLimiter,
};
