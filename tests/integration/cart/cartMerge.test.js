const crypto = require('crypto');
const request = require('supertest');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');
const { Op } = require('sequelize');
const { Cart, CartItem, sequelize } = require('../../../src/models');
const app = require('../../../src/app');
const cartService = require('../../../src/services/cart.service');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');

let token;
let customerIds;
const allCustomerIds = [];

const makeCustomer = async () => {
  const customer = await createTestCustomer();
  customerIds.push(customer.id);
  allCustomerIds.push(customer.id);
  return customer;
};

describe('Cart merge', () => {
  beforeEach(() => {
    token = `guest_${crypto.randomUUID().replace(/-/g, '')}`;
    customerIds = [];
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Cart.destroy({
      where: {
        [Op.or]: [{ sessionToken: token }, { customerId: { [Op.in]: customerIds } }],
      },
    });
  });

  afterAll(async () => {
    if (allCustomerIds.length > 0) {
      await sequelize.query('DELETE FROM customers WHERE id IN (:ids)', {
        replacements: { ids: allCustomerIds },
      });
    }
    await sequelize.close();
  });

  it('should sum quantities given an overlapping SKU (AC2)', async () => {
    const customer = await makeCustomer();
    const a = await createTestVariant({ stockQuantity: 10 });
    await cartService.addItem({ customerId: customer.id }, a.id, 1);
    await cartService.addItem({ sessionToken: token }, a.id, 2);

    const result = await cartService.mergeGuestCart(customer.id, token);

    expect(result.mergedCount).toBe(1);
    const userCart = await Cart.findOne({ where: { customerId: customer.id } });
    const rows = await CartItem.findAll({ where: { cartId: userCart.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
    expect(await Cart.findOne({ where: { sessionToken: token } })).toBeNull();
  });

  it('should move a unique item to the customer cart (AC1)', async () => {
    const customer = await makeCustomer();
    const b = await createTestVariant({ stockQuantity: 10 });
    await cartService.addItem({ sessionToken: token }, b.id, 1);

    await cartService.mergeGuestCart(customer.id, token);

    const userCart = await Cart.findOne({ where: { customerId: customer.id } });
    const rows = await CartItem.findAll({ where: { cartId: userCart.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].productVariantId).toBe(b.id);
  });

  it('should clamp to available stock and report it (AC3)', async () => {
    const customer = await makeCustomer();
    const a = await createTestVariant({ stockQuantity: 2 });
    await cartService.addItem({ customerId: customer.id }, a.id, 1);
    await cartService.addItem({ sessionToken: token }, a.id, 2);

    const result = await cartService.mergeGuestCart(customer.id, token);

    expect(result.clamped).toHaveLength(1);
    expect(result.clamped[0]).toMatchObject({ requested: 3, applied: 2 });
    const userCart = await Cart.findOne({ where: { customerId: customer.id } });
    const rows = await CartItem.findAll({ where: { cartId: userCart.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
  });

  it('should return mergedCount 0 given an unknown token or a replay (AC4, AC6)', async () => {
    const customer = await makeCustomer();
    const a = await createTestVariant({ stockQuantity: 10 });
    await cartService.addItem({ sessionToken: token }, a.id, 1);

    await cartService.mergeGuestCart(customer.id, token);
    const replay = await cartService.mergeGuestCart(customer.id, token);

    expect(replay.mergedCount).toBe(0);
    expect(
      (await cartService.mergeGuestCart(customer.id, 'guest_doesnotexist12345')).mergedCount
    ).toBe(0);
  });

  it('should roll back everything given a failure mid-merge (AC5)', async () => {
    const customer = await makeCustomer();
    const a = await createTestVariant({ stockQuantity: 10 });
    await cartService.addItem({ sessionToken: token }, a.id, 1);
    jest.spyOn(Cart.prototype, 'destroy').mockRejectedValueOnce(new Error('boom'));

    await expect(cartService.mergeGuestCart(customer.id, token)).rejects.toThrow('boom');

    const guestCart = await Cart.findOne({ where: { sessionToken: token } });
    expect(guestCart).not.toBeNull();
    expect(await CartItem.count({ where: { cartId: guestCart.id } })).toBe(1);
  });

  it('should return 401 given a guest token but no login (AC6)', async () => {
    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('X-Session-Token', token)
      .send({});
    expect(res.status).toBe(401);
  });

  it('should return 401 given no identity at all (AC6)', async () => {
    const res = await request(app).post('/api/v1/cart/merge').send({});
    expect(res.status).toBe(401);
  });

  it('should return 400 given a logged-in customer with no valid session token (AC4)', async () => {
    const customer = await makeCustomer();
    const bearer = generateAccessToken(customer.id, 'customer');

    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${bearer}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
