const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #134: revenue counts paid orders only; figures come from SQL aggregates.
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

describe('Admin analytics', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let adminBearer;
  let customerBearer;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const admin = await createAdmin({ email: `stats.${Date.now()}@example.com`, role: 'admin' });
    adminBearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
    const customer = await createTestCustomer();
    customerBearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  const order = async ({ pay }) => {
    const variant = await createTestVariant({ stockQuantity: 5 });
    await sequelize.query('UPDATE products SET price = 1000 WHERE id = :id', {
      replacements: { id: variant.productId },
    });
    const checkout = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', customerBearer)
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], shippingAddress: ADDRESS });
    const orderId = checkout.body.data.order_id;
    if (pay) {
      const intent = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', customerBearer)
        .send({ order_id: orderId });
      await request(app)
        .post('/api/v1/payments/confirm')
        .set('Authorization', customerBearer)
        .send({ order_id: orderId, payment_intent_id: intent.body.data.paymentIntentId });
    }
  };

  const overview = async () =>
    (await request(app).get('/api/v1/admin/analytics').set('Authorization', adminBearer)).body.data;

  it('should add a paid order to revenue but not an unpaid one', async () => {
    const before = await overview();

    await order({ pay: false });
    const afterUnpaid = await overview();
    await order({ pay: true });
    const afterPaid = await overview();

    expect(afterUnpaid.metrics.total_revenue).toBe(before.metrics.total_revenue);
    expect(afterUnpaid.metrics.awaiting_payment).toBe(before.metrics.awaiting_payment + 1);
    expect(afterPaid.metrics.total_revenue).toBe(before.metrics.total_revenue + 1450);
    expect(afterPaid.metrics.paid_orders).toBe(before.metrics.paid_orders + 1);
    expect(afterPaid.recent_orders[0].invoice_number).toMatch(/^DFC-\d{4}-\d{4,}$/);
  });

  it('should return a zero-filled daily series for the requested days', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/sales-trend?days=7')
      .set('Authorization', adminBearer);

    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(7);
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.series[6].revenue).toBeGreaterThanOrEqual(1450);
  });

  it('should clamp the number of days', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/sales-trend?days=5000')
      .set('Authorization', adminBearer);

    expect(res.body.data.days).toBe(365);
  });
});
