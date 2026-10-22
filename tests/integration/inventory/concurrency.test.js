process.env.RESERVE_RATE_LIMIT = '1000';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const {
  reserveStock,
  confirmReservation,
  releaseReservation,
} = require('../../../src/services/reservation.service');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');

const stockOf = async (id) => {
  const [row] = await sequelize.query(
    'SELECT stock_quantity, reserved_quantity FROM product_variants WHERE id = :id',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row;
};

const tokenFor = (id) =>
  jwt.sign({ id, role: 'customer' }, process.env.JWT_SECRET || 'test-secret');

describe('Concurrency (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should never oversell given 50 concurrent requests on stock 5 (AC1)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] }))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(45);
    expect(rejected.every((r) => r.reason.statusCode === 409)).toBe(true);
    expect(await stockOf(v.id)).toEqual({ stock_quantity: 5, reserved_quantity: 5 });
  });

  it('should never deadlock given 20 opposite-order two-item carts (AC2)', async () => {
    const a = await createTestVariant({ stockQuantity: 100 });
    const b = await createTestVariant({ stockQuantity: 100 });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        reserveStock({
          items:
            i % 2 === 0
              ? [
                  { variant_id: a.id, quantity: 1 },
                  { variant_id: b.id, quantity: 1 },
                ]
              : [
                  { variant_id: b.id, quantity: 1 },
                  { variant_id: a.id, quantity: 1 },
                ],
        })
      )
    );

    const deadlocks = results.filter(
      (r) => r.status === 'rejected' && /deadlock|40P01/i.test(String(r.reason))
    );
    expect(deadlocks).toHaveLength(0);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect((await stockOf(a.id)).reserved_quantity).toBe(20);
    expect((await stockOf(b.id)).reserved_quantity).toBe(20);
  });

  it('should roll back everything given one item of a multi-item cart is out of stock', async () => {
    const plenty = await createTestVariant({ stockQuantity: 10 });
    const scarce = await createTestVariant({ stockQuantity: 1 });

    await expect(
      reserveStock({
        items: [
          { variant_id: plenty.id, quantity: 2 },
          { variant_id: scarce.id, quantity: 5 },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect((await stockOf(plenty.id)).reserved_quantity).toBe(0);
    expect((await stockOf(scarce.id)).reserved_quantity).toBe(0);
  });

  it('should keep reserved_quantity equal to the sum of ACTIVE holds after mixed operations', async () => {
    const v = await createTestVariant({ stockQuantity: 20 });

    const made = (
      await Promise.allSettled(
        Array.from({ length: 30 }, (_, i) =>
          reserveStock({ items: [{ variant_id: v.id, quantity: (i % 2) + 1 }] })
        )
      )
    )
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    // Confirm a third, release a third, leave a third ACTIVE, all at once
    await Promise.all(
      made.map((r, i) => {
        if (i % 3 === 0) return confirmReservation(r.reservation_id);
        if (i % 3 === 1) return releaseReservation(r.reservation_id);
        return Promise.resolve();
      })
    );

    const [{ active }] = await sequelize.query(
      `SELECT COALESCE(SUM(ri.quantity), 0)::int AS active
         FROM reservation_items ri JOIN stock_reservations sr ON sr.id = ri.reservation_id
        WHERE ri.variant_id = :id AND sr.status = 'ACTIVE'`,
      { replacements: { id: v.id }, type: QueryTypes.SELECT }
    );
    const [{ confirmed }] = await sequelize.query(
      `SELECT COALESCE(SUM(ri.quantity), 0)::int AS confirmed
         FROM reservation_items ri JOIN stock_reservations sr ON sr.id = ri.reservation_id
        WHERE ri.variant_id = :id AND sr.status = 'CONFIRMED'`,
      { replacements: { id: v.id }, type: QueryTypes.SELECT }
    );

    const stock = await stockOf(v.id);
    expect(stock.reserved_quantity).toBe(active);
    expect(stock.stock_quantity).toBe(20 - confirmed);
  });

  it('should let exactly 5 of 20 customers reserve the last 5 units over HTTP', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const customers = await Promise.all(Array.from({ length: 20 }, () => createTestCustomer()));

    const responses = await Promise.all(
      customers.map((c) =>
        request(app)
          .post('/api/v1/inventory/reserve')
          .set('Authorization', `Bearer ${tokenFor(c.id)}`)
          .send({ items: [{ variant_id: v.id, quantity: 1 }] })
      )
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(15);
    expect((await stockOf(v.id)).reserved_quantity).toBe(5);
  });
});
