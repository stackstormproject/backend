const jwt = require('jsonwebtoken');

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required to verify access tokens');
  }

  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

module.exports = { verifyAccessToken };
