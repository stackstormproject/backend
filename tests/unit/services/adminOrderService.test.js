const { allowedNextStatuses, TRANSITIONS } = require('../../../src/services/adminOrder.service');

describe('allowedNextStatuses', () => {
  it.each([
    ['payment_pending', 'standard', ['cancelled']],
    ['processing', 'standard', ['shipped', 'cancelled']],
    ['processing', 'pickup', ['shipped', 'cancelled', 'delivered']],
    ['shipped', 'standard', ['delivered']],
    ['delivered', 'standard', []],
    ['cancelled', 'standard', []],
    ['mystery', 'standard', []],
  ])('should allow %s (%s) -> %j', (status, shippingOption, expected) => {
    expect(allowedNextStatuses({ status, shippingOption })).toEqual(expected);
  });

  it('should list every order status the database allows', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      [
        'cancelled',
        'confirmed',
        'delivered',
        'payment_pending',
        'processing',
        'return_requested',
        'returned',
        'shipped',
      ].sort()
    );
  });
});
