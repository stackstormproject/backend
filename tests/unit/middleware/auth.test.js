const jwt = require('jsonwebtoken');
const { auth, optionalAuth } = require('../../../src/middleware/auth');
const AppError = require('../../../src/utils/AppError');

describe('auth middleware', () => {
  const secret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test_jwt_secret_that_is_long_enough';
  });

  afterAll(() => {
    if (secret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = secret;
    }
  });

  it('rejects requests without a bearer token', () => {
    const next = jest.fn();

    auth({ headers: {} }, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('sets the user and continues for a valid bearer token', () => {
    const req = {
      headers: {
        authorization: `Bearer ${jwt.sign({ userId: 42, role: 'admin' }, process.env.JWT_SECRET)}`,
      },
    };
    const next = jest.fn();

    auth(req, {}, next);

    expect(req.user).toMatchObject({ userId: 42, role: 'admin' });
    expect(next).toHaveBeenCalledWith();
  });

  it('returns a token-expired error for an expired bearer token', () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET, {
      expiresIn: -1,
    });
    const next = jest.fn();

    auth({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('returns an invalid-token error for a malformed bearer token', () => {
    const next = jest.fn();

    auth({ headers: { authorization: 'Bearer invalid' } }, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('continues with no user when optional authentication has no token', () => {
    const req = { headers: {} };
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });

  it('sets the user when optional authentication has a valid token', () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toMatchObject({ userId: 42 });
    expect(next).toHaveBeenCalledWith();
  });

  it('continues with no user when optional authentication has an invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid' } };
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });

  it('passes AppError instances for failed required authentication', () => {
    const next = jest.fn();

    auth({ headers: { authorization: 'Bearer invalid' } }, {}, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });
});
