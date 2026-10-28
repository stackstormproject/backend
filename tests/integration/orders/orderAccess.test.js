const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #103: order reads selected non-existent columns and leaked orders to any caller.
const ADDRESS = { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' };

const placeOrder = async (agent) => {
  const variant = await createTestVariant({ stockQuantity: 5 });
  await sequelize.query("UPDATE products SET price = 2500, name = 'Batik Shirt' WHERE id = :id", {
    replacements: { id: variant.productId },
  });
  const res = await agent.send({
    items: [{ variant_id: variant.id, quantity: 1 }],
    shippingAddress: ADDRESS,
  });
  return res.body.data;
};

describe('Order read access', () => {
  let owner;
  let ownerBearer;

  beforeEach(async () => {
    owner = await createTestCustomer();
    ownerBearer = `Bearer ${generateAccessToken(owner.id, 'customer')}`;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('should list the customer orders with product names', async () => {
    const order = await placeOrder(
      request(app).post('/api/v1/checkout/initiate').set('Authorization', ownerBearer)
    );

    const res = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', ownerBearer);

    expect(res.status).toBe(200);
    const listed = res.body.data.orders.find((o) => o.id === order.order_id);
    expect(listed.items[0]).toMatchObject({ product_title: 'Batik Shirt', unit_price: 2500 });
  });

  it('should return order tracking milestones to the owner', async () => {
    const order = await placeOrder(
      request(app).post('/api/v1/checkout/initiate').set('Authorization', ownerBearer)
    );

    const res = await request(app)
      .get(`/api/v1/orders/${order.order_id}/track`)
      .set('Authorization', ownerBearer);

    expect(res.status).toBe(200);
  });

  it('should return 404 given an anonymous caller asks for a customer order', async () => {
    const order = await placeOrder(
      request(app).post('/api/v1/checkout/initiate').set('Authorization', ownerBearer)
    );

    const res = await request(app).get(`/api/v1/orders/${order.order_id}`);

    expect(res.status).toBe(404);
  });

  it('should return 404 given another customer asks for the order', async () => {
    const order = await placeOrder(
      request(app).post('/api/v1/checkout/initiate').set('Authorization', ownerBearer)
    );
    const other = await createTestCustomer();

    const res = await request(app)
      .get(`/api/v1/orders/${order.order_id}`)
      .set('Authorization', `Bearer ${generateAccessToken(other.id, 'customer')}`);

    expect(res.status).toBe(404);
  });

  it('should return a guest order only with its guest token', async () => {
    const order = await placeOrder(
      request(app)
        .post('/api/v1/checkout/initiate')
        .set('Content-Type', 'application/json')
        .send({ guest_email: 'guest@example.com' })
    );
    const withToken = await request(app)
      .get(`/api/v1/orders/${order.order_id}`)
      .set('X-Guest-Token', order.guest_order_token);
    const without = await request(app).get(`/api/v1/orders/${order.order_id}`);

    expect(withToken.status).toBe(200);
    expect(without.status).toBe(404);
  });
});
