const { verifyAccessToken } = require('../utils/tokenGenerator');
const { toRequestUser } = require('./auth');

const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Parses an optional Bearer token. No header means a guest and the request
 * continues. A present but invalid token is rejected rather than silently
 * treated as a guest.
 */
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.user = toRequestUser(verifyAccessToken(header.slice(7)));
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }
  }
  return next();
};

/**
 * Decides who owns the cart for this request:
 * a logged-in customer (customerId) or a guest (sessionToken).
 */
const resolveCartIdentity = (req, res, next) => {
  if (req.user && Number.isInteger(Number(req.user.id)) && req.user.role === 'customer') {
    req.cartOwner = { customerId: Number(req.user.id) };
    return next();
  }
  const token = req.get('X-Session-Token');
  if (token && SESSION_TOKEN_RE.test(token)) {
    req.cartOwner = { sessionToken: token };
    return next();
  }
  return res.status(400).json({
    success: false,
    error: 'CART_IDENTITY_REQUIRED',
    message: 'Provide a valid Bearer token or an X-Session-Token header',
  });
};

/**
 * Guards the merge endpoint: only a logged-in, non-admin user may merge
 * a guest cart into their own.
 */
const requireCustomer = (req, res, next) => {
  if (!req.user || req.user.role !== 'customer') {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Log in as a customer to merge a guest cart',
    });
  }
  return next();
};

module.exports = { optionalAuth, resolveCartIdentity, requireCustomer, SESSION_TOKEN_RE };
