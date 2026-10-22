const jwt = require('jsonwebtoken');

const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      // ADAPT: use whatever your login puts in the token (id / sub / customerId)
      req.user = { id: payload.id ?? payload.sub, role: payload.role };
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

const resolveCartIdentity = (req, res, next) => {
  if (req.user && Number.isInteger(Number(req.user.id)) && req.user.role !== 'admin') {
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

module.exports = { optionalAuth, resolveCartIdentity };