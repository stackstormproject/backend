const jwt = require('jsonwebtoken');

const {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateResetToken,
  hashToken,
  getRefreshTtlMs,
} = require('../../../src/utils/tokenGenerator');

describe('tokenGenerator', () => {
  const original = {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough';
  });

  afterEach(() => {
    if (original.jwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = original.jwtSecret;
    }

    if (original.jwtExpiresIn === undefined) {
      delete process.env.JWT_EXPIRES_IN;
    } else {
      process.env.JWT_EXPIRES_IN = original.jwtExpiresIn;
    }

    if (original.refreshExpiresIn === undefined) {
      delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    } else {
      process.env.REFRESH_TOKEN_EXPIRES_IN = original.refreshExpiresIn;
    }
  });

  it('generates and verifies an HS256 access token', () => {
    process.env.JWT_EXPIRES_IN = '2h';

    const token = generateAccessToken(7, 'customer');
    const payload = verifyAccessToken(token);

    expect(payload).toEqual(
      expect.objectContaining({
        userId: 7,
        role: 'customer',
        iss: 'stackstorm-api',
      })
    );

    expect(jwt.decode(token).exp - jwt.decode(token).iat).toBe(7200);
  });

  it('uses a one-hour access token lifetime by default', () => {
    delete process.env.JWT_EXPIRES_IN;

    const { iat, exp } = jwt.decode(generateAccessToken(5, 'customer'));

    expect(exp - iat).toBe(60 * 60);
  });

  it('uses JWT_EXPIRES_IN when configured', () => {
    process.env.JWT_EXPIRES_IN = '2h';

    const { iat, exp } = jwt.decode(generateAccessToken(5, 'customer'));

    expect(exp - iat).toBe(2 * 60 * 60);
  });

  it('requires a JWT secret to sign or verify access tokens', () => {
    delete process.env.JWT_SECRET;

    expect(() => generateAccessToken(7, 'customer')).toThrow('JWT_SECRET is required');

    expect(() => verifyAccessToken('token')).toThrow('JWT_SECRET is required');
  });

  it('rejects expired access tokens', () => {
    const token = jwt.sign({ userId: 7, role: 'customer' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'stackstorm-api',
      expiresIn: -1,
    });

    expect(() => verifyAccessToken(token)).toThrow('jwt expired');
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign(
      { userId: 1, role: 'super_admin' },
      'another-secret-that-is-long-enough!!',
      {
        algorithm: 'HS256',
        issuer: 'stackstorm-api',
      }
    );

    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects an unsigned token using the none algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');

    const body = Buffer.from(JSON.stringify({ userId: 1, role: 'super_admin' })).toString(
      'base64url'
    );

    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrow();
  });

  it('generates refresh tokens and hashes them correctly', () => {
    const { rawToken, tokenHash } = generateRefreshToken();

    expect(rawToken).toHaveLength(43);
    expect(hashToken(rawToken)).toBe(tokenHash);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates a reset token with a hash and future expiry', () => {
    const { rawToken, tokenHash, expiresAt } = generateResetToken();

    expect(rawToken).toHaveLength(64);
    expect(hashToken(rawToken)).toBe(tokenHash);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('uses seven days when refresh-token expiry is unset', () => {
    delete process.env.REFRESH_TOKEN_EXPIRES_IN;

    expect(getRefreshTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('uses the configured refresh-token duration', () => {
    process.env.REFRESH_TOKEN_EXPIRES_IN = '14d';

    expect(getRefreshTtlMs()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('rejects malformed refresh-token expiry configuration', () => {
    process.env.REFRESH_TOKEN_EXPIRES_IN = '2 weeks';

    expect(() => getRefreshTtlMs()).toThrow(
      'REFRESH_TOKEN_EXPIRES_IN must be a positive number of days'
    );
  });
});
