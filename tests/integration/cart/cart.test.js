const request = require('supertest');
const app = require('../../../src/app');
const { Cart, CartItem, sequelize } = require('../../../src/models');
const { createTestVariant } = require('../../helpers/factories');

const TOKEN = 'guest_abcdef1234567890';
const post = (body, token = TOKEN) =>
  request(app).post('/api/v1/cart/items').set('X-Session-Token', token).send(body);

describe('Cart API', () => {
  afterEach(async () => {
    await CartItem.destroy({ where: {} });
    await Cart.destroy({ where: {} });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('should create a guest cart and row given a valid add (AC1)', async () => {
    const v = await createTestVariant({ stockQuantity: 10 });

    const res = await post({ variant_id: v.id, quantity: 2 });

    expect(res.status).toBe(201);
    const cart = await Cart.findOne({ where: { sessionToken: TOKEN } });
    expect(cart.customerId).toBeNull();
    const row = await CartItem.findOne({ where: { cartId: cart.id } });
    expect(row.quantity).toBe(2);
  });

  it('should consolidate into one row given the same SKU twice (AC2)', async () => {
    const v = await createTestVariant({ stockQuantity: 10 });

    await post({ variant_id: v.id, quantity: 1 });
    await post({ variant_id: v.id, quantity: 2 });

    const rows = await CartItem.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
  });

  it('should return 400 CART_IDENTITY_REQUIRED given no identity (AC3)', async () => {
    const res = await request(app).get('/api/v1/cart');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CART_IDENTITY_REQUIRED');
  });

  it('should return 400 given an invalid quantity (AC4)', async () => {
    const v = await createTestVariant({ stockQuantity: 10 });

    expect((await post({ variant_id: v.id, quantity: 0 })).status).toBe(400);
    expect((await post({ variant_id: v.id, quantity: 1.5 })).status).toBe(400);
    expect(await CartItem.count()).toBe(0);
  });

  it('should return 404 given an unknown variant (AC4)', async () => {
    const res = await post({ variant_id: 999999, quantity: 1 });

    expect(res.status).toBe(404);
  });

  it('should return 409 with availability given quantity above stock (AC5)', async () => {
    const v = await createTestVariant({ stockQuantity: 2, reservedQuantity: 0 });

    const res = await post({ variant_id: v.id, quantity: 5 });

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/Available: 2/);
  });

  it('should leave a single row given two concurrent first-adds', async () => {
    const v = await createTestVariant({ stockQuantity: 10 });

    await Promise.all([
      post({ variant_id: v.id, quantity: 1 }),
      post({ variant_id: v.id, quantity: 1 }),
    ]);

    const rows = await CartItem.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
  });

  it("should not let a guest delete another guest's item", async () => {
    const v = await createTestVariant({ stockQuantity: 10 });
    const created = await post({ variant_id: v.id, quantity: 1 });
    const itemId = created.body.data.item.id;

    const res = await request(app)
      .delete(`/api/v1/cart/items/${itemId}`)
      .set('X-Session-Token', 'guest_someoneelse123456');

    expect(res.status).toBe(404);
  });
});
