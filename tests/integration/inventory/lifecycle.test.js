const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const {
  reserveStock,
  confirmReservation,
  releaseReservation,
  releaseExpiredReservations,
} = require('../../../src/services/reservation.service');
const { createTestVariant } = require('../../helpers/factories');

const stockOf = async (id) => {
  const [row] = await sequelize.query(
    'SELECT stock_quantity, reserved_quantity FROM product_variants WHERE id = :id',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row;
};

const backdate = (id) =>
  sequelize.query(
    `UPDATE stock_reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = :id`,
    { replacements: { id } }
  );

describe('Reservation lifecycle (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should deduct stock given reserve then confirm (AC3)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    expect(await confirmReservation(r.reservation_id)).toBe(true);

    expect(await stockOf(v.id)).toEqual({ stock_quantity: 3, reserved_quantity: 0 });
  });

  it('should restore availability given reserve then release (AC3)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    expect(await releaseReservation(r.reservation_id)).toBe(true);

    expect(await stockOf(v.id)).toEqual({ stock_quantity: 5, reserved_quantity: 0 });
  });

  it('should restore availability given reserve, expire, sweep (AC3)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });
    await backdate(r.reservation_id);

    await releaseExpiredReservations();

    expect(await stockOf(v.id)).toEqual({ stock_quantity: 5, reserved_quantity: 0 });
  });

  it('should refuse to confirm after the sweep released the hold', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });
    await backdate(r.reservation_id);
    await releaseExpiredReservations();

    expect(await confirmReservation(r.reservation_id)).toBe(false);
    expect(await stockOf(v.id)).toEqual({ stock_quantity: 5, reserved_quantity: 0 });
  });

  it('should free the stock for the next shopper after expiry', async () => {
    const v = await createTestVariant({ stockQuantity: 1 });
    const first = await reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] });
    await expect(
      reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] })
    ).rejects.toMatchObject({ statusCode: 409 });

    await backdate(first.reservation_id);
    await releaseExpiredReservations();

    await expect(
      reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] })
    ).resolves.toHaveProperty('reservation_id');
  });
});
