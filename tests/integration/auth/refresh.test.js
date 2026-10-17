const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../../src/app');
const { RefreshToken } = require('../../../src/models');
const { resetDatabase, createCustomer, sequelize } = require('../../helpers/db');

const EMAIL = 'alice@example.com';
const PASSWORD = 'SecurePass@123';

const cookieOf = (res) =>
  res.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];

async function login() {
  const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
  return cookieOf(res);
}

const refreshWith = (cookie) => request(app).post('/api/auth/refresh').set('Cookie', cookie);

describe('POST /api/auth/refresh', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createCustomer({ email: EMAIL, password: PASSWORD });
  });

  afterAll(() => sequelize.close());

  it('should return 200 and a new cookie given a valid refresh token', async () => {
    const cookie = await login();
    const response = await refreshWith(cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
    expect(cookieOf(response)).not.toBe(cookie);
    expect(await RefreshToken.count({ where: { usedAt: null } })).toBe(1);
  });

  it('should return 401 REFRESH_TOKEN_EXPIRED given an expired token', async () => {
    const cookie = await login();
    await RefreshToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: {} });

    const response = await refreshWith(cookie);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('should revoke all sessions given a rotated token reused after the grace period', async () => {
    const oldCookie = await login();
    const newCookie = cookieOf(await refreshWith(oldCookie));
    await RefreshToken.update(
      { usedAt: new Date(Date.now() - 60 * 1000) },
      { where: { usedAt: { [Op.ne]: null } } }
    );

    const reuse = await refreshWith(oldCookie);
    const afterwards = await refreshWith(newCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('REFRESH_TOKEN_REUSE');
    expect(afterwards.status).toBe(401);
    expect(afterwards.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('should let only one request succeed given two simultaneous refreshes', async () => {
    const cookie = await login();

    const results = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('should return 401 NO_REFRESH_TOKEN given no cookie', async () => {
    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('NO_REFRESH_TOKEN');
  });

  it('should reject the old token given a logout', async () => {
    const cookie = await login();
    await request(app).post('/api/auth/logout').set('Cookie', cookie);

    const response = await refreshWith(cookie);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_REFRESH_TOKEN');
  });
});
