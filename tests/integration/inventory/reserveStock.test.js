const { sequelize } = require('../../../src/models');
const { reserveStock } = require('../../../src/services/reservation.service');
const { createTestVariant } = require('../../helpers/factories');

describe('reserveStock concurrency (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should reserve exactly 5 given 30 concurrent requests on stock 5', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        reserveStock({ items: [{ variant_id: variant.id, quantity: 1 }] })
      )
    );

    await variant.reload();
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(25);
    expect(variant.reservedQuantity).toBe(5);
  });

  it('should not deadlock given opposite-order multi-item carts', async () => {
    const a = await createTestVariant({ stockQuantity: 100 });
    const b = await createTestVariant({ stockQuantity: 100 });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        reserveStock({
          items:
            i % 2 === 0
              ? [{ variant_id: a.id, quantity: 1 }, { variant_id: b.id, quantity: 1 }]
              : [{ variant_id: b.id, quantity: 1 }, { variant_id: a.id, quantity: 1 }],
        })
      )
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});