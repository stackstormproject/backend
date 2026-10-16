const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to sign or verify access tokens');
  }
  return process.env.JWT_SECRET;
}

function getRefreshTtlMs() {
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
  const match = /^(\d+)d$/.exec(expiresIn);
  if (!match) {
    throw new Error('REFRESH_TOKEN_EXPIRES_IN must be a number of days (for example, 7d)');
  }
  return Number(match[1]) * 24 * 60 * 60 * 1000;
}

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashToken(rawToken) };
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTtlMs,
  hashToken,
  verifyAccessToken,
};
