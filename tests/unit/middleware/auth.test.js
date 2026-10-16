const jwt = require('jsonwebtoken');
const { auth, optionalAuth } = require('../../../src/middleware/auth');

describe('auth middleware', () => {
  const secret = 'a-test-signing-secret-that-is-long-enough';
  const makeRequest = (authorization) => ({ headers: { authorization } });

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it('rejects a request without a bearer token', () => {
    const next = jest.fn();

    auth(makeRequest(undefined), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' })
    );
  });

  it('attaches the verified identity for a valid bearer token', () => {
    const req = makeRequest(`Bearer ${jwt.sign({ userId: 9, role: 'customer' }, secret)}`);
    const next = jest.fn();

    auth(req, {}, next);

    expect(req.user).toEqual(expect.objectContaining({ userId: 9, role: 'customer' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('returns a distinct error for an expired token', () => {
    const token = jwt.sign({ userId: 9 }, secret, { expiresIn: -1 });
    const next = jest.fn();

    auth(makeRequest(`Bearer ${token}`), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'TOKEN_EXPIRED' })
    );
  });

  it('rejects invalid tokens', () => {
    const next = jest.fn();

    auth(makeRequest('Bearer not-a-jwt'), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' })
    );
  });

  it('leaves unauthenticated requests anonymous for optional auth', () => {
    const req = makeRequest(undefined);
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches a valid identity for optional auth', () => {
    const token = jwt.sign({ userId: 9, role: 'customer' }, secret);
    const req = makeRequest(`Bearer ${token}`);
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toEqual(expect.objectContaining({ userId: 9, role: 'customer' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('ignores invalid credentials for optional auth', () => {
    const req = makeRequest('Bearer invalid');
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });
});
