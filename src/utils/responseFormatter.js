function successResponse(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    errors: [],
  });
}

function errorResponse(res, message = 'An error occurred', errors = [], statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors: Array.isArray(errors) ? errors : [errors],
  });
}

module.exports = {
  successResponse,
  errorResponse,
};
