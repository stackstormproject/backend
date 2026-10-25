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

  it('should create a 409 conflict error', () => {
    const err = ApiError.conflict('Duplicate email', { field: 'email' }, 'DUPLICATE_EMAIL');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Duplicate email');
    expect(err.details).toEqual({ field: 'email' });
    expect(err.code).toBe('DUPLICATE_EMAIL');
  });

  it('should use default parameter values across all static helper methods', () => {
    const base = new ApiError(500, 'Base error');
    expect(base.code).toBe('ERROR');

    const notFound = ApiError.notFound();
    expect(notFound.statusCode).toBe(404);
    expect(notFound.message).toBe('Resource not found');
    expect(notFound.code).toBe('NOT_FOUND');

    const badReq = ApiError.badRequest();
    expect(badReq.statusCode).toBe(400);
    expect(badReq.message).toBe('Bad request');
    expect(badReq.code).toBe('BAD_REQUEST');

    const unauth = ApiError.unauthorized();
    expect(unauth.statusCode).toBe(401);
    expect(unauth.message).toBe('Unauthorized');
    expect(unauth.code).toBe('UNAUTHORIZED');

    const forbidden = ApiError.forbidden();
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('Forbidden');
    expect(forbidden.code).toBe('FORBIDDEN');

    const conflict = ApiError.conflict();
    expect(conflict.statusCode).toBe(409);
    expect(conflict.message).toBe('Conflict');
    expect(conflict.code).toBe('CONFLICT');

    const internal = ApiError.internal();
    expect(internal.statusCode).toBe(500);
    expect(internal.message).toBe('Internal server error');
    expect(internal.code).toBe('INTERNAL_ERROR');
  });
});
