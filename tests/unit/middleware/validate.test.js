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
});
