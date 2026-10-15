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
