const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../../src/app');
const { Order, ProductVariant, sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #104: payment must be verified by the server and must deduct the reserved stock.
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

const startCheckout = async ({ bearer = null, quantity = 2 } = {}) => {
  const variant = await createTestVariant({ stockQuantity: 5 });
  await sequelize.query('UPDATE products SET price = 3000 WHERE id = :id', {
    replacements: { id: variant.productId },
  });
  const req = request(app).post('/api/v1/checkout/initiate');
  if (bearer) req.set('Authorization', bearer);
  const res = await req.send({
    ...(bearer ? {} : { guest_email: 'guest@example.com' }),
    items: [{ variant_id: variant.id, quantity }],
    shippingAddress: ADDRESS,
  });
  return { variant, checkout: res.body.data };
};

describe('Payment flow (mock provider)', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let bearer;

  beforeAll(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  beforeEach(async () => {
    const customer = await createTestCustomer();
    bearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  it('should pay the order and deduct stock permanently given create-intent then confirm', async () => {
    const { variant, checkout } = await startCheckout({ bearer });

    const intent = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', bearer)
      .send({ order_id: checkout.order_id });
    const confirm = await request(app)
      .post('/api/v1/payments/confirm')
      .set('Authorization', bearer)
      .send({ order_id: checkout.order_id, payment_intent_id: intent.body.data.paymentIntentId });

    expect(intent.status).toBe(200);
    expect(intent.body.data).toMatchObject({ provider: 'mock', amount: 6450 });
    expect(confirm.status).toBe(200);
    expect((await Order.findByPk(checkout.order_id)).status).toBe('processing');
    const fresh = await ProductVariant.findByPk(variant.id);
    expect(fresh.stockQuantity).toBe(3);
    expect(fresh.reservedQuantity).toBe(0);
    const [hold] = await sequelize.query('SELECT status FROM stock_reservations WHERE id = :id', {
      replacements: { id: checkout.reservation_id },
      type: QueryTypes.SELECT,
    });
    expect(hold.status).toBe('CONFIRMED');
  });

  it('should let a guest pay with the guest order token', async () => {
    const { checkout } = await startCheckout();

    const intent = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('X-Guest-Token', checkout.guest_order_token)
      .send({ order_id: checkout.order_id });
    const confirm = await request(app)
      .post('/api/v1/payments/confirm')
      .set('X-Guest-Token', checkout.guest_order_token)
      .send({ order_id: checkout.order_id, payment_intent_id: intent.body.data.paymentIntentId });

    expect(confirm.status).toBe(200);
  });

  it('should return 404 given someone else tries to pay or confirm the order', async () => {
    const { checkout } = await startCheckout({ bearer });

    const res = await request(app)
      .post('/api/v1/payments/confirm')
      .send({ order_id: checkout.order_id, payment_intent_id: 'mock_pi_x' });

    expect(res.status).toBe(404);
    expect((await Order.findByPk(checkout.order_id)).status).toBe('payment_pending');
  });

  it('should return 400 given a forged intent id', async () => {
    const { checkout } = await startCheckout({ bearer });
    await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', bearer)
      .send({ order_id: checkout.order_id });

    const res = await request(app)
      .post('/api/v1/payments/confirm')
      .set('Authorization', bearer)
      .send({ order_id: checkout.order_id, payment_intent_id: 'mock_pi_forged' });

    expect(res.status).toBe(400);
  });

  it('should no longer expose the unsafe finalize endpoint', async () => {
    const { checkout } = await startCheckout({ bearer });

    const res = await request(app)
      .post(`/api/v1/orders/${checkout.order_id}/finalize`)
      .set('Authorization', bearer)
      .send({});

    expect(res.status).toBe(404);
  });
});
