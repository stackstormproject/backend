const { Cart, CartItem, sequelize } = require('../../../src/models');
const cartService = require('../../../src/services/cart.service');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');

describe('Cart merge concurrency (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should merge a guest cart exactly once given two simultaneous merges (AC4)', async () => {
    const customer = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 10 });
    const token = `guest_conc_${Date.now()}_abcdef`;
    await cartService.addItem({ sessionToken: token }, v.id, 1);

    const [a, b] = await Promise.all([
      cartService.mergeGuestCart(customer.id, token),
      cartService.mergeGuestCart(customer.id, token),
    ]);

    expect(a.mergedCount + b.mergedCount).toBe(1);
    const cart = await Cart.findOne({ where: { customerId: customer.id } });
    const rows = await CartItem.findAll({ where: { cartId: cart.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(1);
  });
});
