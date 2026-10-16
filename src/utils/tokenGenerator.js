const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { AUTH } = require('../config/constants');

const ISSUER = 'stackstorm-api';

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to sign or verify access tokens');
  }

  return process.env.JWT_SECRET;
}

function getRefreshTtlMs() {
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
  const match = /^(\d+)d$/.exec(expiresIn);

  if (!match || Number(match[1]) < 1) {
    throw new Error('REFRESH_TOKEN_EXPIRES_IN must be a positive number of days (for example, 7d)');
  }

  return Number(match[1]) * 24 * 60 * 60 * 1000;
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: ISSUER,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: ISSUER,
  });
}

function generateRefreshToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  };
}

function generateResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + AUTH.RESET_TOKEN_MINUTES * 60 * 1000),
  };
}

module.exports = {
  hashToken,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateResetToken,
  getRefreshTtlMs,
};
