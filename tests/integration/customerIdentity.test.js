const crypto = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const { Cart, Wishlist, sequelize } = require('../../src/models');
const { createTestVariant, createTestCustomer } = require('../helpers/factories');
const { generateAccessToken } = require('../../src/utils/tokenGenerator');

// Refs #100: access tokens carry `userId`; cart, wishlist and merge used to read `req.user.id`.
describe('Customer identity across cart and wishlist', () => {
  let customer;
  let bearer;

  beforeEach(async () => {
    customer = await createTestCustomer();
    bearer = `Bearer ${generateAccessToken(customer.id, 'customer')}`;
  });

  afterEach(async () => {
    await Cart.destroy({ where: { customerId: customer.id } });
    await Wishlist.destroy({ where: { customerId: customer.id } });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('should add to the customer cart given only a bearer token', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .send({ variant_id: variant.id, quantity: 1 });

    expect(res.status).toBe(201);
    const cart = await Cart.findOne({ where: { customerId: customer.id } });
    expect(cart).not.toBeNull();
  });

  it('should merge a guest cart into the customer cart given a valid session token', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });
    const guest = `guest_${crypto.randomUUID().replace(/-/g, '')}`;
    await request(app)
      .post('/api/v1/cart/items')
      .set('X-Session-Token', guest)
      .send({ variant_id: variant.id, quantity: 2 });

    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', bearer)
      .send({ session_token: guest });

    expect(res.status).toBe(200);
    expect(res.body.data.mergedCount).toBe(1);
  });

  it('should reject merge given an admin token', async () => {
    const adminBearer = `Bearer ${generateAccessToken(1, 'super_admin')}`;

    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', adminBearer)
      .send({ session_token: 'guest_abcdefghijklmnop' });

    expect(res.status).toBe(401);
  });

  it('should persist and list a wishlist item given a logged-in customer', async () => {
    const variant = await createTestVariant({ stockQuantity: 3 });

    const toggle = await request(app)
      .post('/api/v1/wishlist/toggle')
      .set('Authorization', bearer)
      .send({ product_id: variant.productId });
    const list = await request(app).get('/api/v1/wishlist').set('Authorization', bearer);

    expect(toggle.status).toBe(200);
    expect(toggle.body.data.wishlisted).toBe(true);
    expect(list.body.data.map((p) => p.id)).toContain(variant.productId);
    expect(list.body.data[0].availableStock).toBe(3);
  });

  it('should return 401 AUTH_REQUIRED given a guest wishlist toggle', async () => {
    const res = await request(app).post('/api/v1/wishlist/toggle').send({ productId: 1 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_REQUIRED');
  });

  it('should return 400 given a non-numeric product id', async () => {
    const res = await request(app)
      .post('/api/v1/wishlist/toggle')
      .set('Authorization', bearer)
      .send({ productId: 'abc' });

    expect(res.status).toBe(400);
  });
});
