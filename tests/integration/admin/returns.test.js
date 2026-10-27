const request = require('supertest');
const app = require('../../../src/app');
const { ProductVariant, Return, sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #137: approve / reject / receive returns and exchanges (FR023, UC-005).
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

describe('Admin returns workflow', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let admin;
  let adminBearer;
  let customerBearer;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // mock payments: refunds are recorded, not sent
    admin = await createAdmin({ email: `ret.${Date.now()}@example.com`, role: 'admin' });
    adminBearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
    const customer = await createTestCustomer();
    customerBearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  const asAdmin = (method, url) =>
    request(app)[method](`/api/v1${url}`).set('Authorization', adminBearer);

  /** Real flow: checkout, pay, ship, deliver, then the customer asks for a return. */
  const deliveredReturn = async ({ type = 'return', exchangeStock = 5 } = {}) => {
    const variant = await createTestVariant({ stockQuantity: 10 });
    // Refs #155: the replacement is another size of the same product.
    const other = await createTestVariant({
      stockQuantity: exchangeStock,
      productId: variant.productId,
    });
    await sequelize.query('UPDATE products SET price = 3000 WHERE id = :id', {
      replacements: { id: variant.productId },
    });
    const checkout = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', customerBearer)
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], shippingAddress: ADDRESS });
    const orderId = checkout.body.data.order_id;
    const intent = await request(app)
      .post('/api/v1/payments/create-intent')
      .set('Authorization', customerBearer)
      .send({ order_id: orderId });
    await request(app)
      .post('/api/v1/payments/confirm')
      .set('Authorization', customerBearer)
      .send({ order_id: orderId, payment_intent_id: intent.body.data.paymentIntentId });
    await asAdmin('patch', `/admin/orders/${orderId}/status`).send({
      status: 'shipped',
      tracking_number: 'TRK1',
    });
    await asAdmin('patch', `/admin/orders/${orderId}/status`).send({ status: 'delivered' });
    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', customerBearer);
    const requested = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', customerBearer)
      .send({
        order_item_id: order.body.data.items[0].id,
        type,
        reason: 'Wrong size',
        exchange_variant_id: type === 'exchange' ? other.id : undefined,
      });
    return { returnId: requested.body.data.id, variant, other };
  };

  const stockOf = async (id) => (await ProductVariant.findByPk(id)).stockQuantity;

  it('should list requests first with order, customer and item details', async () => {
    const { returnId } = await deliveredReturn();

    const res = await asAdmin('get', '/admin/returns?status=requested&limit=100');

    expect(res.status).toBe(200);
    const row = res.body.data.returns.find((r) => r.id === returnId);
    expect(row).toMatchObject({ status: 'requested', type: 'return', refund_amount: 3000 });
    expect(row.order.invoice_number).toMatch(/^DFC-\d{4}-\d{4,}$/);
    expect(row.item).toMatchObject({ quantity: 1, subtotal: 3000 });
    expect(row.customer.email).toBeTruthy();
  });

  it('should approve, then restock and refund when an acceptable item arrives', async () => {
    const { returnId, variant } = await deliveredReturn();
    const before = await stockOf(variant.id);

    const approved = await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});
    const received = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: true,
      note: 'Tags on',
    });

    expect(approved.body.data.status).toBe('approved');
    expect(received.status).toBe(200);
    expect(received.body.data).toMatchObject({
      status: 'completed',
      admin_note: 'Tags on',
      resolved_by: admin.name,
      refund: { refunded: true, amount: 3000 },
    });
    expect(await stockOf(variant.id)).toBe(before + 1);
  });

  it('should swap stock for an exchange', async () => {
    const { returnId, variant, other } = await deliveredReturn({ type: 'exchange' });
    const [returnedBefore, replacementBefore] = [
      await stockOf(variant.id),
      await stockOf(other.id),
    ];

    await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});
    const received = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: true,
    });

    expect(received.body.data).toMatchObject({ status: 'completed', refund: null });
    expect(await stockOf(variant.id)).toBe(returnedBefore + 1);
    expect(await stockOf(other.id)).toBe(replacementBefore - 1);
  });

  it('should refuse an exchange when the replacement size ran out, changing nothing', async () => {
    const { returnId, variant } = await deliveredReturn({ type: 'exchange', exchangeStock: 0 });
    const before = await stockOf(variant.id);
    await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});

    const received = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: true,
    });

    expect(received.status).toBe(409);
    expect(await stockOf(variant.id)).toBe(before);
    expect((await Return.findByPk(returnId)).status).toBe('approved');
  });

  it('should reject with a reason the customer can see', async () => {
    const { returnId } = await deliveredReturn();

    const noReason = await asAdmin('post', `/admin/returns/${returnId}/reject`).send({});
    const rejected = await asAdmin('post', `/admin/returns/${returnId}/reject`).send({
      note: 'Worn and washed',
    });
    const mine = await request(app)
      .get('/api/v1/returns/my-returns')
      .set('Authorization', customerBearer);

    expect(noReason.status).toBe(400);
    expect(rejected.body.data.status).toBe('rejected');
    expect(mine.body.data.returns.find((r) => r.id === returnId).admin_note).toBe(
      'Worn and washed'
    );
  });

  it('should reject an item that arrives in unacceptable condition without restocking', async () => {
    const { returnId, variant } = await deliveredReturn();
    const before = await stockOf(variant.id);
    await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});

    const noNote = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: false,
    });
    const received = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: false,
      note: 'Stained',
    });

    expect(noNote.status).toBe(400);
    expect(received.body.data.status).toBe('rejected');
    expect(await stockOf(variant.id)).toBe(before);
  });

  it('should enforce the order of steps and resolve a return only once', async () => {
    const { returnId } = await deliveredReturn();

    const receiveEarly = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({
      acceptable: true,
    });
    await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});
    const approveTwice = await asAdmin('post', `/admin/returns/${returnId}/approve`).send({});
    const [first, second] = await Promise.all([
      asAdmin('post', `/admin/returns/${returnId}/receive`).send({ acceptable: true }),
      asAdmin('post', `/admin/returns/${returnId}/receive`).send({ acceptable: true }),
    ]);
    const missingFlag = await asAdmin('post', `/admin/returns/${returnId}/receive`).send({});

    expect(receiveEarly.status).toBe(409);
    expect(approveTwice.status).toBe(409);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(missingFlag.status).toBe(400);
  });

  it('should return 404 for an unknown return and 403 for customers', async () => {
    expect((await asAdmin('get', '/admin/returns/999999')).status).toBe(404);
    expect((await asAdmin('post', '/admin/returns/999999/approve').send({})).status).toBe(404);
    const asCustomer = await request(app)
      .get('/api/v1/admin/returns')
      .set('Authorization', customerBearer);
    expect(asCustomer.status).toBe(403);
  });
});
