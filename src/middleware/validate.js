const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((error) => ({
    field: error.path,
    message: error.msg,
  }));
  return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid input data.', details));
}

module.exports = validate;
