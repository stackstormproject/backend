const request = require('supertest');
const app = require('../../../src/app');
const { Category, sequelize } = require('../../../src/models');
const { createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #132: who may do what in the admin API.
const bearer = (id, role) => `Bearer ${generateAccessToken(id, role)}`;

describe('Admin role matrix', () => {
  let customer;
  let manager;
  let agent;

  beforeAll(async () => {
    customer = await createTestCustomer();
    manager = await createAdmin({ email: `mgr.${Date.now()}@example.com`, role: 'admin' });
    agent = await createAdmin({ email: `agent.${Date.now()}@example.com`, role: 'support_agent' });
  });

  afterAll(async () => {
    await Category.destroy({ where: { slug: ['matrix-test', 'should-not-exist'] } });
    await sequelize.close();
  });

  it('should refuse category changes from a customer', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearer(customer.id, 'customer'))
      .send({ name: 'Should not exist', slug: 'should-not-exist' });

    expect(res.status).toBe(403);
    expect(await Category.count({ where: { slug: 'should-not-exist' } })).toBe(0);
  });

  it('should let a manager create a category', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearer(manager.id, 'admin'))
      .send({ name: 'Matrix Test', slug: 'matrix-test' });

    expect(res.status).toBe(201);
  });

  it.each([
    ['get', '/api/v1/admin/analytics'],
    ['get', '/api/v1/admin/orders'],
    ['patch', '/api/v1/admin/orders/1/status'],
    ['post', '/api/v1/admin/products'],
    ['post', '/api/v1/upload/images'],
  ])('should refuse a support agent: %s %s', async (method, url) => {
    const res = await request(app)
      [method](url)
      .set('Authorization', bearer(agent.id, 'support_agent'));

    expect(res.status).toBe(403);
  });

  it('should let a support agent read support sessions', async () => {
    const res = await request(app)
      .get('/api/v1/admin/support/sessions')
      .set('Authorization', bearer(agent.id, 'support_agent'));

    expect(res.status).toBe(200);
  });

  it('should refuse a customer everywhere under /admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/support/sessions')
      .set('Authorization', bearer(customer.id, 'customer'));

    expect(res.status).toBe(403);
  });

  it('should return the admin profile from /auth/admin/me', async () => {
    const res = await request(app)
      .get('/api/v1/auth/admin/me')
      .set('Authorization', bearer(manager.id, 'admin'));

    expect(res.status).toBe(200);
    expect(res.body.admin).toMatchObject({ id: manager.id, email: manager.email, role: 'admin' });
    expect(res.body.admin.hashedPassword).toBeUndefined();
  });
});
