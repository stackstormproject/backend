const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../../src/app');
const { Order, OrderItem, ProductVariant, sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #102: checkout used to price every line at 0 and insert order items without a variant id.
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

const priceProduct = async (productId, price) =>
  sequelize.query('UPDATE products SET price = :price WHERE id = :id', {
    replacements: { price, id: productId },
  });

describe('POST /api/v1/checkout/initiate', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should create a priced order with linked lines and reservation given a customer', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });
    await priceProduct(variant.productId, 4200);
    const customer = await createTestCustomer();

    const res = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', `Bearer ${generateAccessToken(customer.id, 'customer')}`)
      .send({ items: [{ variant_id: variant.id, quantity: 2 }], shippingAddress: ADDRESS });

    expect(res.status).toBe(201);
    expect(res.body.data.breakdown).toMatchObject({
      subtotal: 8400,
      shipping_fee: 450,
      total_amount: 8850,
    });
    const order = await Order.findByPk(res.body.data.order_id);
    expect(Number(order.totalAmount)).toBe(8850);
    expect(order.customerId).toBe(customer.id);
    const lines = await OrderItem.findAll({ where: { orderId: order.id } });
    expect(lines[0].productVariantId).toBe(variant.id);
    const [reservation] = await sequelize.query(
      'SELECT order_id, status FROM stock_reservations WHERE id = :id',
      { replacements: { id: res.body.data.reservation_id }, type: QueryTypes.SELECT }
    );
    expect(reservation).toMatchObject({ order_id: order.id, status: 'ACTIVE' });
    await variant.reload();
    expect(variant.reservedQuantity).toBe(2);
  });

  it('should waive shipping given a subtotal at the LKR 10,000 threshold', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });
    await priceProduct(variant.productId, 5000);

    const res = await request(app)
      .post('/api/v1/checkout/initiate')
      .send({
        guest_email: 'guest@example.com',
        items: [{ variant_id: variant.id, quantity: 2 }],
        shippingAddress: ADDRESS,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.breakdown.shipping_fee).toBe(0);
    expect(res.body.data.guest_order_token).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should return 409 and hold nothing given quantity above available stock', async () => {
    const variant = await createTestVariant({ stockQuantity: 1 });
    await priceProduct(variant.productId, 1000);

    const res = await request(app)
      .post('/api/v1/checkout/initiate')
      .send({
        guest_email: 'guest@example.com',
        items: [{ variant_id: variant.id, quantity: 3 }],
        shippingAddress: ADDRESS,
      });

    expect(res.status).toBe(409);
    const fresh = await ProductVariant.findByPk(variant.id);
    expect(fresh.reservedQuantity).toBe(0);
  });

  it('should return 400 given a guest without an email', async () => {
    const variant = await createTestVariant({ stockQuantity: 1 });

    const res = await request(app)
      .post('/api/v1/checkout/initiate')
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], shippingAddress: ADDRESS });

    expect(res.status).toBe(400);
  });
});
