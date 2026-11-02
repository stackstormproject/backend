const AppError = require('../../../src/utils/AppError');

describe('AppError', () => {
  it('stores the HTTP status, code, and message', () => {
    const error = new AppError(400, 'BAD_INPUT', 'Invalid input');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_INPUT');
    expect(error.message).toBe('Invalid input');
    expect(error.details).toBeUndefined();
  });

  it('includes details when provided', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const error = new AppError(400, 'VALIDATION_ERROR', 'Invalid input', details);

    expect(error.details).toBe(details);
  });
});
