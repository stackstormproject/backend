
const jwt = require('jsonwebtoken');

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required to verify access tokens');
  }

  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

module.exports = { verifyAccessToken };
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { AUTH } = require('../config/constants');

const ISSUER = 'stackstorm-api';
const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');
function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: ISSUER,
  });
}
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
}
function generateRefreshToken() {
  const rawToken = crypto.randomBytes(64).toString('hex');
  return { rawToken, tokenHash: hashToken(rawToken) };
}
function generateResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + AUTH.RESET_TOKEN_MINUTES * 60 * 1000),
  };
}
function getRefreshTtlMs() {
  const match = /^(\d+)d$/.exec(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d');
  const days = match ? parseInt(match[1], 10) : 7;
  return days * 24 * 60 * 60 * 1000;
}
module.exports = {
  hashToken,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateResetToken,
  getRefreshTtlMs,
};

