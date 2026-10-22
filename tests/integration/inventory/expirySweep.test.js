const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const {
  reserveStock,
  confirmReservation,
  releaseExpiredReservations,
} = require('../../../src/services/reservation.service');
const { createTestVariant } = require('../../helpers/factories');

const backdate = (id) =>
  sequelize.query(
    `UPDATE stock_reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = :id`,
    { replacements: { id } }
  );

const statusOf = async (id) => {
  const [row] = await sequelize.query('SELECT status FROM stock_reservations WHERE id = :id', {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return row.status;
};

const reservedOf = async (variantId) => {
  const [row] = await sequelize.query(
    'SELECT reserved_quantity FROM product_variants WHERE id = :id',
    { replacements: { id: variantId }, type: QueryTypes.SELECT }
  );
  return row.reserved_quantity;
};

describe('expiry sweep (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should release an expired reservation and restore availability (AC1)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });
    await backdate(r.reservation_id);

    expect(await releaseExpiredReservations()).toBeGreaterThanOrEqual(1);

    expect(await statusOf(r.reservation_id)).toBe('EXPIRED');
    expect(await reservedOf(v.id)).toBe(0);
  });

  it('should leave an active reservation untouched (AC2)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    await releaseExpiredReservations();

    expect(await statusOf(r.reservation_id)).toBe('ACTIVE');
    expect(await reservedOf(v.id)).toBe(2);
  });

  it('should release each hold exactly once given two concurrent sweeps (AC4)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });
    await backdate(r.reservation_id);

    await Promise.all([releaseExpiredReservations(), releaseExpiredReservations()]);

    expect(await statusOf(r.reservation_id)).toBe('EXPIRED');
    expect(await reservedOf(v.id)).toBe(0); // never negative, never double-released
  });

  it('should not release a hold that was confirmed before the sweep', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });
    await confirmReservation(r.reservation_id);
    await backdate(r.reservation_id);

    await releaseExpiredReservations();

    expect(await statusOf(r.reservation_id)).toBe('CONFIRMED');
  });
});
