const AppError = require('./AppError');

class ApiError extends AppError {
  constructor(statusCode, message, details = undefined, code = 'ERROR') {
    super(statusCode, code, message, details);
  }

  static notFound(message = 'Resource not found', details = undefined, code = 'NOT_FOUND') {
    return new ApiError(404, message, details, code);
  }

  static badRequest(message = 'Bad request', details = undefined, code = 'BAD_REQUEST') {
    return new ApiError(400, message, details, code);
  }

  static unauthorized(message = 'Unauthorized', details = undefined, code = 'UNAUTHORIZED') {
    return new ApiError(401, message, details, code);
  }

  static forbidden(message = 'Forbidden', details = undefined, code = 'FORBIDDEN') {
    return new ApiError(403, message, details, code);
  }

  static internal(message = 'Internal server error', details = undefined, code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, details, code);
  }
}

module.exports = ApiError;
