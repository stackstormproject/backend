const { body } = require('express-validator');
const validate = require('../../../src/middleware/validate');
const AppError = require('../../../src/utils/AppError');

describe('validate middleware', () => {
  it('continues when the request has no validation errors', async () => {
    const req = { body: { email: 'user@example.com' } };

    await body('email').isEmail().run(req);

    const next = jest.fn();

    validate(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes a validation error with field details to next', async () => {
    const req = { body: { email: 'not-an-email' } };

    await body('email').isEmail().withMessage('Invalid email').run(req);

    const next = jest.fn();

    validate(req, {}, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data.',
      details: [{ field: 'email', message: 'Invalid email' }],
    });
  });

  it('passes multiple structured validation errors to the error handler', async () => {
    const req = {
      body: {
        email: 'invalid-email',
        password: '',
      },
    };

    await body('email').isEmail().withMessage('A valid email is required').run(req);

    await body('password').notEmpty().withMessage('Password is required').run(req);

    const next = jest.fn();

    validate(req, {}, next);

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
