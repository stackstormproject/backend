const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTtlMs,
  hashToken,
  verifyAccessToken,
} = require('../../../src/utils/tokenGenerator');

describe('tokenGenerator', () => {
  const original = {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  };

  afterEach(() => {
    if (original.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original.jwtSecret;
    if (original.jwtExpiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = original.jwtExpiresIn;
    if (original.refreshExpiresIn === undefined) delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    else process.env.REFRESH_TOKEN_EXPIRES_IN = original.refreshExpiresIn;
  });

  it('generates and verifies an HS256 access token', () => {
    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough';
    process.env.JWT_EXPIRES_IN = '2h';
    const token = generateAccessToken(7, 'customer');
    const payload = verifyAccessToken(token);

    expect(payload).toEqual(expect.objectContaining({ userId: 7, role: 'customer' }));
    expect(jwt.decode(token).exp - jwt.decode(token).iat).toBe(7200);
  });

  it('uses a one-hour access token lifetime by default', () => {
    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough';
    delete process.env.JWT_EXPIRES_IN;
    const token = generateAccessToken(7, 'customer');
    const payload = jwt.decode(token);

    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('requires a JWT secret to sign or verify access tokens', () => {
    delete process.env.JWT_SECRET;

    expect(() => generateAccessToken(7, 'customer')).toThrow('JWT_SECRET is required');
    expect(() => verifyAccessToken('token')).toThrow('JWT_SECRET is required');
  });

  it('rejects expired access tokens', () => {
    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough';
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET, { expiresIn: -1 });

    expect(() => verifyAccessToken(token)).toThrow('jwt expired');
  });

  it('hashes opaque refresh tokens and calculates their default and configured lifetimes', () => {
    delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    const { rawToken, tokenHash } = generateRefreshToken();

    expect(rawToken).toHaveLength(43);
    expect(tokenHash).toBe(hashToken(rawToken));
    expect(getRefreshTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);

    process.env.REFRESH_TOKEN_EXPIRES_IN = '14d';
    expect(getRefreshTtlMs()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('rejects malformed refresh-token lifetime configuration', () => {
    process.env.REFRESH_TOKEN_EXPIRES_IN = '2 weeks';

    expect(() => getRefreshTtlMs()).toThrow('REFRESH_TOKEN_EXPIRES_IN must be a number of days');
  });
});
