const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../../src/app');
const { Order, ProductVariant, sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #133: admin order list, detail and status rules.
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

describe('Admin order management', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let adminBearer;
  let customerBearer;
  let customer;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // mock payment provider
    const admin = await createAdmin({ email: `orders.${Date.now()}@example.com`, role: 'admin' });
    adminBearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
    customer = await createTestCustomer();
    customerBearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  /** Places an order through the real checkout; pays it unless `paid` is false. */
  const placeOrder = async ({ paid = true, shippingMethod = 'standard', quantity = 2 } = {}) => {
    const variant = await createTestVariant({ stockQuantity: 10 });
    await sequelize.query('UPDATE products SET price = 2000 WHERE id = :id', {
      replacements: { id: variant.productId },
    });
    const checkout = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', customerBearer)
      .send({
        items: [{ variant_id: variant.id, quantity }],
        shippingAddress: ADDRESS,
        shippingMethod,
      });
    const orderId = checkout.body.data.order_id;
    if (paid) {
      const intent = await request(app)
        .post('/api/v1/payments/create-intent')
        .set('Authorization', customerBearer)
        .send({ order_id: orderId });
      await request(app)
        .post('/api/v1/payments/confirm')
        .set('Authorization', customerBearer)
        .send({ order_id: orderId, payment_intent_id: intent.body.data.paymentIntentId });
    }
    return { orderId, variant, reservationId: checkout.body.data.reservation_id };
  };

  const setStatus = (orderId, body) =>
    request(app)
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', adminBearer)
      .send(body);

  it('should find an order by its customer-facing number and show it in detail', async () => {
    const { orderId } = await placeOrder();
    const number = `DFC-${new Date().getFullYear()}-${String(orderId).padStart(4, '0')}`;

    const list = await request(app)
      .get('/api/v1/admin/orders')
      .query({ search: number })
      .set('Authorization', adminBearer);
    const detail = await request(app)
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', adminBearer);

    expect(list.status).toBe(200);
    expect(list.body.data.orders.map((o) => o.invoice_number)).toEqual([number]);
    expect(list.body.data.orders[0]).toMatchObject({
      items_count: 2,
      customer_email: expect.stringContaining('@'),
    });
    expect(detail.body.data.items).toHaveLength(1);
    expect(detail.body.data.allowed_statuses).toEqual(['shipped', 'cancelled']);
  });

  it('should filter by status and reject an unknown status', async () => {
    await placeOrder({ paid: false });

    const pending = await request(app)
      .get('/api/v1/admin/orders?status=payment_pending')
      .set('Authorization', adminBearer);
    const bad = await request(app)
      .get('/api/v1/admin/orders?status=lost')
      .set('Authorization', adminBearer);

    expect(pending.body.data.orders.every((o) => o.status === 'payment_pending')).toBe(true);
    expect(bad.status).toBe(400);
  });

  it('should require a tracking number to ship, then allow delivered with a delivery date', async () => {
    const { orderId } = await placeOrder();

    const noTracking = await setStatus(orderId, { status: 'shipped' });
    const shipped = await setStatus(orderId, {
      status: 'shipped',
      tracking_number: 'KOOMBIYO-778',
    });
    const delivered = await setStatus(orderId, { status: 'delivered' });

    expect(noTracking.status).toBe(400);
    expect(shipped.body.data).toMatchObject({ status: 'shipped', tracking_number: 'KOOMBIYO-778' });
    expect(delivered.body.data.delivery_date).toBeTruthy();
  });

  it('should refuse to ship an unpaid order', async () => {
    const { orderId } = await placeOrder({ paid: false });

    const res = await setStatus(orderId, { status: 'shipped', tracking_number: 'X1' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cannot become "shipped"/);
  });

  it('should let a collection order be marked collected without a tracking number', async () => {
    const { orderId } = await placeOrder({ shippingMethod: 'pickup' });

    const res = await setStatus(orderId, { status: 'delivered' });

    expect(res.status).toBe(200);
  });

  it('should restock and refund when a paid order is cancelled', async () => {
    const { orderId, variant } = await placeOrder({ quantity: 3 });
    const afterSale = await ProductVariant.findByPk(variant.id);

    const res = await setStatus(orderId, { status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toMatchObject({ refunded: true, provider: 'mock', amount: 6450 });
    const restocked = await ProductVariant.findByPk(variant.id);
    expect(restocked.stockQuantity).toBe(afterSale.stockQuantity + 3);
    const [log] = await sequelize.query(
      'SELECT change_quantity, reason FROM inventory_logs WHERE product_variant_id = :id ORDER BY id DESC LIMIT 1',
      { replacements: { id: variant.id }, type: QueryTypes.SELECT }
    );
    expect(log.change_quantity).toBe(3);
    expect(log.reason).toMatch(/cancelled/);
  });

  it('should release the stock hold when an unpaid order is cancelled', async () => {
    const { orderId, variant, reservationId } = await placeOrder({ paid: false, quantity: 2 });

    await setStatus(orderId, { status: 'cancelled' });

    const fresh = await ProductVariant.findByPk(variant.id);
    expect(fresh.reservedQuantity).toBe(0);
    const [hold] = await sequelize.query('SELECT status FROM stock_reservations WHERE id = :id', {
      replacements: { id: reservationId },
      type: QueryTypes.SELECT,
    });
    expect(hold.status).toBe('RELEASED');
    expect((await Order.findByPk(orderId)).status).toBe('cancelled');
  });

  it('should not change a delivered order back', async () => {
    const { orderId } = await placeOrder({ shippingMethod: 'pickup' });
    await setStatus(orderId, { status: 'delivered' });

    const res = await setStatus(orderId, { status: 'cancelled' });

    expect(res.status).toBe(409);
  });

  it('should return 404 for an unknown order and 400 for an unknown status', async () => {
    expect(
      (await request(app).get('/api/v1/admin/orders/999999').set('Authorization', adminBearer))
        .status
    ).toBe(404);
    expect((await setStatus(1, { status: 'teleported' })).status).toBe(400);
  });
});
