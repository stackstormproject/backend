const request = require('supertest');
const app = require('../../../src/app');
const { RefreshToken, sequelize } = require('../../../src/models');
const { resetDatabase, createCustomer } = require('../../helpers/db');

// Refs #105: refresh-token rotation, reuse detection and logout (ADR-003).
const PASSWORD = 'SecurePass@123';

const refreshCookieOf = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));
const cookiePair = (setCookie) => setCookie.split(';')[0];

const login = async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'alice@example.com', password: PASSWORD });
  return cookiePair(refreshCookieOf(res));
};

describe('POST /api/v1/auth/refresh and /logout', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createCustomer({ password: PASSWORD });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('should scope the refresh cookie to /api so v1 routes receive it', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD });

    expect(refreshCookieOf(res)).toMatch(/Path=\/api;/);
    expect(refreshCookieOf(res)).toMatch(/HttpOnly/);
  });

  it('should return a new access token and rotate the cookie given a valid refresh token', async () => {
    const cookie = await login();

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.customer.email).toBe('alice@example.com');
    expect(res.body.refreshToken).toBeUndefined();
    expect(cookiePair(refreshCookieOf(res))).not.toBe(cookie);
  });

  it('should revoke every session given a rotated token is reused', async () => {
    const stolen = await login();
    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', stolen);
    const freshCookie = cookiePair(refreshCookieOf(rotated));

    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', stolen);
    const victim = await request(app).post('/api/v1/auth/refresh').set('Cookie', freshCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('REFRESH_TOKEN_REUSE');
    expect(victim.status).toBe(401);
  });

  it('should return 401 REFRESH_TOKEN_EXPIRED given an expired token', async () => {
    const cookie = await login();
    await RefreshToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: {} });

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('should return 401 REFRESH_TOKEN_MISSING given no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REFRESH_TOKEN_MISSING');
  });

  it('should revoke the token and clear the cookie on logout', async () => {
    const cookie = await login();

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(out.status).toBe(204);
    expect(refreshCookieOf(out)).toMatch(/refreshToken=;/);
    expect(after.status).toBe(401);
  });

  it('should succeed on logout given no cookie', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
  });
});
