const { notFound, errorHandler } = 
require('../../../src/middleware/errorHandler');
const AppError = require('../../../src/utils/AppError');
jest.mock('../../../src/config/logger');
const makeRes = () => {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = { path: '/x', method: 'GET' };
describe('errorHandler', () => {
  it('should return the AppError status and body given an AppError', () => {
    const res = makeRes();
    errorHandler(new AppError(401, 'UNAUTHORIZED', 'No token'), req, res, 
jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED', message: 
'No token' });
  });
  it('should include details given an AppError with details', () => {
    const res = makeRes();
    const details = [{ field: 'email', message: 'invalid' }];
    errorHandler(new AppError(400, 'VALIDATION_ERROR', 'Invalid input', details), req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({
      error: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    });
  });
  it('should pass the error to next given response headers are sent', () => {
    const err = new Error('headers already sent');
    const res = makeRes();
    const next = jest.fn();
    res.headersSent = true;
    errorHandler(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
  it('should return validation details given a Sequelize validation error', () => {
    const res = makeRes();
    const err = new Error('invalid');
    err.name = 'SequelizeValidationError';
    err.errors = [{ path: 'email', message: 'must be valid' }];
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].details).toEqual([
      { field: 'email', message: 'must be valid' },
    ]);
  });
  it('should return 409 DUPLICATE_ENTRY given a unique constraint error', () => {
    const res = makeRes();
    const err = new Error('duplicate');
    err.name = 'SequelizeUniqueConstraintError';
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('DUPLICATE_ENTRY');
  });
  it('should return 400 INVALID_JSON given a body parse failure', () => {
    const res = makeRes();
    const err = new Error('bad json');
    err.type = 'entity.parse.failed';
errorHandler(err, req, res, jest.fn());
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error).toBe('INVALID_JSON');
});
it('should return 413 given an oversized request body', () => {
  const res = makeRes();
  const err = new Error('too large');
  err.type = 'entity.too.large';
  errorHandler(err, req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(413);
  expect(res.json.mock.calls[0][0].error).toBe('PAYLOAD_TOO_LARGE');
});
it('should expose the error message outside production', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const res = makeRes();
  errorHandler(new Error('database unavailable'), req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].message).toBe('database unavailable');
  process.env.NODE_ENV = original;
});
it('should hide the error message given an unknown error in production', () => {
const original = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
const res = makeRes();
errorHandler(new Error('secret db detail'), req, res, jest.fn());
expect(res.status).toHaveBeenCalledWith(500);
expect(res.json.mock.calls[0][0].message).not.toContain('secret');
process.env.NODE_ENV = original;
});
it('should pass a 404 AppError to next given an unknown route', () => {
const next = jest.fn();
notFound(req, makeRes(), next);
expect(next.mock.calls[0][0].statusCode).toBe(404);
});
});