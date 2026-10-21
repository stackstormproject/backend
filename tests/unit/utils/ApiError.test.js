const ApiError = require('../../../src/utils/ApiError');
const AppError = require('../../../src/utils/AppError');

describe('ApiError', () => {
  it('should instantiate correctly and inherit from AppError', () => {
    const error = new ApiError(400, 'Custom error', { field: 'test' }, 'CUSTOM_CODE');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Custom error');
    expect(error.details).toEqual({ field: 'test' });
    expect(error.code).toBe('CUSTOM_CODE');
  });

  it('should create a 404 notFound error', () => {
    const err = ApiError.notFound('Item missing');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Item missing');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('should create a 400 badRequest error', () => {
    const err = ApiError.badRequest('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('should create a 401 unauthorized error', () => {
    const err = ApiError.unauthorized('No auth token');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('No auth token');
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('should create a 403 forbidden error', () => {
    const err = ApiError.forbidden('Access denied');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Access denied');
    expect(err.code).toBe('FORBIDDEN');
  });

  it('should create a 500 internal error', () => {
    const err = ApiError.internal('Database crash');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Database crash');
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});
