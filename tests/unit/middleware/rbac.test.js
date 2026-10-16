const { rbac } = require('../../../src/middleware/rbac');
const AppError = require('../../../src/utils/AppError');

describe('rbac middleware', () => {
  it('returns an unauthorized error when the request has no user', () => {
    const next = jest.fn();

    rbac(['admin'])({}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  });

  it('returns a forbidden error when the user role is not allowed', () => {
    const next = jest.fn();

    rbac(['admin'])({ user: { role: 'customer' } }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  });

  it('continues when the user role is allowed', () => {
    const next = jest.fn();

    rbac(['admin'])({ user: { role: 'admin' } }, {}, next);

    expect(next).toHaveBeenCalledWith();
  });
});
