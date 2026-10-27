const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/tokenGenerator');

/**
 * Access tokens carry the subject as `userId` (see tokenGenerator). Older code paths read
 * `req.user.id`, so both are exposed from one place instead of patching every consumer.
 */
function toRequestUser(payload) {
  return { ...payload, id: payload.userId ?? payload.id ?? payload.sub };
}

function readBearer(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.split(' ')[1] : null;
}

function auth(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'No authentication token provided.'));
  }

  try {
    req.user = toRequestUser(verifyAccessToken(token));
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired.'));
    }
    return next(new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token.'));
  }
}

function optionalAuth(req, res, next) {
  const token = readBearer(req);
  req.user = null;
  if (token) {
    try {
      req.user = toRequestUser(verifyAccessToken(token));
    } catch (err) {
      req.user = null;
    }
  }
  return next();
}

module.exports = { auth, optionalAuth, toRequestUser };
