const logger = require('../config/logger');

function requestLogger(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - started,
      userId: req.user ? req.user.userId : undefined,
    });
  });
  next();
}
module.exports = requestLogger;
