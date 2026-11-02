const jwt = require('jsonwebtoken');
const { auth, optionalAuth } = require('../../../src/middleware/auth');
const AppError = require('../../../src/utils/AppError');

describe('auth middleware', () => {
  const secret = 'a-test-signing-secret-that-is-long-enough';
  const originalSecret = process.env.JWT_SECRET;

  const makeRequest = (authorization) => ({
    headers: authorization ? { authorization } : {},
  });

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  describe('auth', () => {
    it('rejects requests without a bearer token', () => {
      const next = jest.fn();

      auth(makeRequest(undefined), {}, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('sets the user and continues for a valid bearer token', () => {
      const token = jwt.sign({ userId: 42, role: 'admin' }, secret, { issuer: 'stackstorm-api' });
      const req = makeRequest(`Bearer ${token}`);
      const next = jest.fn();

      auth(req, {}, next);

      expect(req.user).toMatchObject({
        userId: 42,
        role: 'admin',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('returns a token-expired error for an expired bearer token', () => {
      const token = jwt.sign({ userId: 42 }, secret, { expiresIn: -1, issuer: 'stackstorm-api' });
      const next = jest.fn();

      auth(makeRequest(`Bearer ${token}`), {}, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('returns an invalid-token error for a malformed bearer token', () => {
      const next = jest.fn();

      auth(makeRequest('Bearer invalid'), {}, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('passes AppError instances for failed required authentication', () => {
      const next = jest.fn();

      auth(makeRequest('Bearer invalid'), {}, next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe('optionalAuth', () => {
    it('continues with no user when optional authentication has no token', () => {
      const req = makeRequest(undefined);
      const next = jest.fn();

      optionalAuth(req, {}, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledWith();
    });

    it('sets the user when optional authentication has a valid token', () => {
      const token = jwt.sign({ userId: 42, role: 'customer' }, secret, {
        issuer: 'stackstorm-api',
      });
      const req = makeRequest(`Bearer ${token}`);
      const next = jest.fn();

      optionalAuth(req, {}, next);

      expect(req.user).toMatchObject({
        userId: 42,
        role: 'customer',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('continues with no user when optional authentication has an invalid token', () => {
      const req = makeRequest('Bearer invalid');
      const next = jest.fn();

      optionalAuth(req, {}, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledWith();
    });
  });
});

describe('toRequestUser', () => {
  const { toRequestUser } = require('../../../src/middleware/auth');

  it('should expose userId as id given a standard access-token payload', () => {
    expect(toRequestUser({ userId: 7, role: 'customer' })).toMatchObject({ id: 7, userId: 7 });
  });

  it('should fall back to sub given a payload without userId', () => {
    expect(toRequestUser({ sub: 9 }).id).toBe(9);
  });
});

describe('removed test tokens (#122)', () => {
  const { auth } = require('../../../src/middleware/auth');

  it.each(['mock-admin-token', 'jwt-admin-token-xyz'])(
    'should reject the literal token %s outside production',
    (token) => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const req = { headers: { authorization: `Bearer ${token}` } };
      const next = jest.fn();

      auth(req, {}, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      process.env.NODE_ENV = previous;
    }
  );
});
