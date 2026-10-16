const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/tokenGenerator');

function readBearer(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

function auth(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'No authentication token provided.'));
  }

  try {
    req.user = verifyAccessToken(token);
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
      req.user = verifyAccessToken(token);
    } catch (err) {
      req.user = null;
    }
  }
  return next();
}

module.exports = { auth, optionalAuth };
