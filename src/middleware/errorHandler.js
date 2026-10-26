const AppError = require('../utils/AppError');
const logger = require('../config/logger');

function notFound(req, res, next) {
  next(
    new AppError(
      404,
      'NOT_FOUND',
      `Route not found: ${req.method} 
${req.path}`
    )
  );
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500;
  let body = {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  };
  if (err instanceof AppError) {
    status = err.statusCode;
    body = { error: err.code, message: err.message };
    if (err.details) body.details = err.details;
  } else if (err.name === 'SequelizeValidationError') {
    status = 400;
    body = {
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data.',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    body = { error: 'DUPLICATE_ENTRY', message: 'A record with this value already exists.' };
    if (err.errors && Array.isArray(err.errors) && err.errors.length > 0) {
      body.details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    }
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: 'INVALID_JSON', message: 'Request body is not valid JSON.' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' };
  } else if (err.name === 'MulterError') {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      body = {
        error: 'LIMIT_FILE_SIZE',
        message: 'File too large. Maximum allowed size is 5MB.',
      };
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      body = {
        error: 'LIMIT_FILE_COUNT',
        message: 'Too many files. Maximum allowed is 5 files.',
      };
    } else {
      body = { error: err.code, message: err.message };
    }
  }
  if (status >= 500) {
    logger.error('Unhandled error', {
      error: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
    if (process.env.NODE_ENV !== 'production') body.message = err.message;
  } else {
    logger.warn('Request rejected', { code: body.error, status, path: req.path });
  }
  return res.status(status).json(body);
}
module.exports = { notFound, errorHandler };
