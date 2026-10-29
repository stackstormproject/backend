const request = require('supertest');
const app = require('../../../src/app');
const { resetDatabase, createCustomer, sequelize } = require('../../helpers/db');
const { Customer, RefreshToken } = require('../../../src/models');

// Refs #185: forgot password and reset through the API.
const login = (password) =>
  request(app).post('/api/v1/auth/login').send({ email: 'alice@example.com', password });

describe('password reset', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createCustomer();
  });
  afterAll(() => sequelize.close());

  it('should reset the password with the emailed link and end old sessions', async () => {
    await login('SecurePass@123');

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'Alice@Example.com ' });
    expect(forgot.status).toBe(202);
    expect(forgot.body.message).toMatch(/If an account uses this email/);
    const token = new URL(forgot.body.dev_reset_url).searchParams.get('token');

    const weak = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'short' });
    expect(weak.status).toBe(400);

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'BrandNew123' });
    expect(reset.status).toBe(200);

    expect((await login('SecurePass@123')).status).toBe(401);
    expect((await login('BrandNew123')).status).toBe(200);
    const customer = await Customer.findOne({ where: { email: 'alice@example.com' } });
    expect(customer.resetTokenHash).toBeNull();
    expect(await RefreshToken.count({ where: { customerId: customer.id, revokedAt: null } })).toBe(
      1
    );

    const again = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Another123' });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('should answer the same for an email without an account', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'If an account uses this email, a reset link is on its way.',
    });
  });

  it('should reject a malformed email or token', async () => {
    expect(
      (await request(app).post('/api/v1/auth/forgot-password').send({ email: 'x' })).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: 'abc', password: 'BrandNew123' })
      ).status
    ).toBe(400);
  });
});
