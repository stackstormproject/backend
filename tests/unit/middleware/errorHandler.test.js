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
  it('should return 409 DUPLICATE_ENTRY given a unique constraint error', () 
=> {
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
it('should hide the error message given an unknown error in production', () 
=> {
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