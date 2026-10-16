const jwt = require('jsonwebtoken');

const { verifyAccessToken } = require('../../../src/utils/tokenGenerator');

describe('verifyAccessToken', () => {
  const secret = 'test_jwt_secret_that_is_long_enough';
  const originalSecret = process.env.JWT_SECRET;

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

  it('returns the payload from a valid HS256 token', () => {
    const token = jwt.sign({ userId: 42, role: 'admin' }, secret, {
      algorithm: 'HS256',
    });

    expect(verifyAccessToken(token)).toMatchObject({ userId: 42, role: 'admin' });
  });

  it('rejects tokens signed with a different secret', () => {
    const token = jwt.sign({ userId: 42 }, 'wrong-secret', {
      algorithm: 'HS256',
    });

    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it('rejects tokens that use an unsupported algorithm', () => {
    const token = jwt.sign({ userId: 42 }, secret, { algorithm: 'HS384' });

    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it('throws when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;

    expect(() => verifyAccessToken('token')).toThrow(
      'JWT_SECRET is required to verify access tokens',
    );

    process.env.JWT_SECRET = secret;
  });
});

const {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateResetToken,
  hashToken,
  getRefreshTtlMs,
} = require('../../../src/utils/tokenGenerator');

describe('tokenGenerator', () => {
  it('should decode userId and role given a token it just signed', () => {
    const payload = verifyAccessToken(generateAccessToken(5, 'customer'));
    expect(payload).toMatchObject({ userId: 5, role: 'customer' });
  });

  it('should use a one-hour expiry when JWT_EXPIRES_IN is unset', () => {
    const original = process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_EXPIRES_IN;
    try {
      const { iat, exp } = jwt.decode(generateAccessToken(5, 'customer'));
      expect(exp - iat).toBe(60 * 60);
    } finally {
      if (original === undefined) delete process.env.JWT_EXPIRES_IN;
      else process.env.JWT_EXPIRES_IN = original;
    }
  });

  it('should use JWT_EXPIRES_IN when configured', () => {
    const original = process.env.JWT_EXPIRES_IN;
    process.env.JWT_EXPIRES_IN = '2h';
    try {
      const { iat, exp } = jwt.decode(generateAccessToken(5, 'customer'));
      expect(exp - iat).toBe(2 * 60 * 60);
    } finally {
      if (original === undefined) delete process.env.JWT_EXPIRES_IN;
      else process.env.JWT_EXPIRES_IN = original;
    }
  });

  it('should reject a token signed with a different secret', () => {
    const forged = jwt.sign({ userId: 1, role: 'super_admin' }, 'another-secret-that-is-long-enough!!', {
      algorithm: 'HS256',
      issuer: 'stackstorm-api',
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('should reject an unsigned token given the none algorithm', () => {
    const header = Buffer.from('{"alg":"none"}').toString('base64url');
    const body = Buffer.from('{"userId":1,"role":"super_admin"}').toString('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrow();
  });

  it('should return a raw token whose SHA-256 hash is the stored hash', () => {
    const { rawToken, tokenHash } = generateRefreshToken();
    expect(rawToken).toHaveLength(128);
    expect(hashToken(rawToken)).toBe(tokenHash);
  });

  it('should return a hashed reset token with an expiry', () => {
    const { rawToken, tokenHash, expiresAt } = generateResetToken();
    expect(rawToken).toHaveLength(64);
    expect(hashToken(rawToken)).toBe(tokenHash);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should use 7 days given REFRESH_TOKEN_EXPIRES_IN is not set', () => {
    delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    expect(getRefreshTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('should use the configured refresh-token duration', () => {
    const original = process.env.REFRESH_TOKEN_EXPIRES_IN;
    process.env.REFRESH_TOKEN_EXPIRES_IN = '14d';
    try {
      expect(getRefreshTtlMs()).toBe(14 * 24 * 60 * 60 * 1000);
    } finally {
      if (original === undefined) delete process.env.REFRESH_TOKEN_EXPIRES_IN;
      else process.env.REFRESH_TOKEN_EXPIRES_IN = original;
    }
  });

  it('should fall back to 7 days given an invalid refresh-token duration', () => {
    const original = process.env.REFRESH_TOKEN_EXPIRES_IN;
    process.env.REFRESH_TOKEN_EXPIRES_IN = 'invalid';
    try {
      expect(getRefreshTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);
    } finally {
      if (original === undefined) delete process.env.REFRESH_TOKEN_EXPIRES_IN;
      else process.env.REFRESH_TOKEN_EXPIRES_IN = original;
    }
  });
});

