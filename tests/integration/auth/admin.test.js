const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../src/app');
const { resetDatabase, createCustomer, createAdmin, sequelize } = require('../../helpers/db');

const adminLogin = () =>
  request(app)
    .post('/api/auth/admin/login')
    .send({ email: 'admin@example.com', password: 'AdminPass@123' });

describe('admin authentication', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(() => sequelize.close());

  it('should return a token with the admin role given valid admin credentials', async () => {
    await createAdmin();

    const response = await adminLogin();

    expect(response.status).toBe(200);
    expect(jwt.decode(response.body.accessToken).role).toBe('admin');
  });

  it('should return 200 on admin me given an admin token', async () => {
    await createAdmin();
    const login = await adminLogin();

    const response = await request(app)
      .get('/api/auth/admin/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
  });

  it('should return 403 FORBIDDEN on admin me given a customer token', async () => {
    await createCustomer();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass@123' });

    const response = await request(app)
      .get('/api/auth/admin/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('should return 401 on admin me given no token', async () => {
    const response = await request(app).get('/api/auth/admin/me');

    expect(response.status).toBe(401);
  });
});
