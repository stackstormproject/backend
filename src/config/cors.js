const allowedOrigins = [
  process.env.FRONTEND_CUSTOMER_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.FRONTEND_ADMIN_URL || 'http://localhost:5174',
];

if (process.env.CORS_WHITELIST) {
  process.env.CORS_WHITELIST.split(',').forEach((origin) => {
    const trimmed = origin.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  // In development and test environments, allow localhost with any port or subdomain (e.g. admin.localhost)
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    if (/^http:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Session-Token',
    'X-Guest-Token',
  ],
};

module.exports = corsOptions;
module.exports.isOriginAllowed = isOriginAllowed;
