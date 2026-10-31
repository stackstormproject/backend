const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { createTestVariant } = require('../../helpers/factories');
const { createAdmin, createCustomer } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #138: searchable customer records (FR024).
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

describe('Admin customers', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let admin;
  let bearer;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    admin = await createAdmin({ email: `crm.${Date.now()}@example.com`, role: 'admin' });
    bearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  const asAdmin = (method, url) =>
    request(app)[method](`/api/v1${url}`).set('Authorization', bearer);

  const newCustomer = async () => {
    const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
    return createCustomer({ email: `kamal.${tag}@example.lk` });
  };

  const buy = async (customer, { pay = true } = {}) => {
    const customerBearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
    const variant = await createTestVariant({ stockQuantity: 5 });
    await sequelize.query('UPDATE products SET price = 2500 WHERE id = :id', {
      replacements: { id: variant.productId },
    });
    const checkout = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', customerBearer)
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], shippingAddress: ADDRESS });
    if (!pay) return;
    const orderId = checkout.body.data.order_id;
    const intent = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', customerBearer)
      .send({ order_id: orderId });
    await request(app)
      .post('/api/v1/payments/confirm')
      .set('Authorization', customerBearer)
      .send({ order_id: orderId, payment_intent_id: intent.body.data.paymentIntentId });
  };

  it('should find a customer by email with paid orders and spend only', async () => {
    const customer = await newCustomer();
    await buy(customer);
    await buy(customer, { pay: false });

    const res = await asAdmin(
      'get',
      `/admin/customers?search=${encodeURIComponent(customer.email)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.customers).toHaveLength(1);
    expect(res.body.data.customers[0]).toMatchObject({
      id: customer.id,
      order_count: 1,
      total_spent: 2950,
      tier: 'silver',
      points: 0,
    });
  });

  it('should sort by spend and filter by tier', async () => {
    const res = await asAdmin('get', '/admin/customers?sort=spend&tier=silver&limit=100');

    const spend = res.body.data.customers.map((c) => c.total_spent);
    expect([...spend].sort((a, b) => b - a)).toEqual(spend);
    expect(res.body.data.customers.every((c) => c.tier === 'silver')).toBe(true);
  });

  it('should show a customer profile with orders and addresses', async () => {
    const customer = await newCustomer();
    await buy(customer);

    const res = await asAdmin('get', `/admin/customers/${customer.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.recent_orders[0]).toMatchObject({
      status: 'processing',
      total_amount: 2950,
    });
    expect(res.body.data.recent_orders[0].invoice_number).toMatch(/^DFC-/);
    expect(res.body.data.addresses).toEqual([]);
  });

  it('should return 404 for an unknown customer and 403 for support agents', async () => {
    const agent = await createAdmin({
      email: `agent.crm.${Date.now()}@example.com`,
      role: 'support_agent',
    });

    expect((await asAdmin('get', '/admin/customers/999999')).status).toBe(404);
    const asAgent = await request(app)
      .get('/api/v1/admin/customers')
      .set('Authorization', `Bearer ${generateAccessToken(agent.id, 'support_agent')}`);
    expect(asAgent.status).toBe(403);
  });
});
