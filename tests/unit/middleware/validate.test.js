const { validationResult } = require('express-validator');
const validate = require('../../../src/middleware/validate');

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

describe('validate middleware', () => {
  afterEach(() => jest.clearAllMocks());

  it('continues when the request has no validation errors', () => {
    validationResult.mockReturnValue({ isEmpty: () => true });
    const next = jest.fn();

    validate({}, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes a structured validation error to the error handler', () => {
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'email', msg: 'A valid email is required' },
        { path: 'password', msg: 'Password is required' },
      ],
    });
    const next = jest.fn();

    validate({}, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'email', message: 'A valid email is required' },
          { field: 'password', message: 'Password is required' },
        ],
      })
    );
  });
});
