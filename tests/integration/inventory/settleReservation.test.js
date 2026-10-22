const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../../src/models');
const {
  reserveStock,
  confirmReservation,
  releaseReservation,
} = require('../../../src/services/reservation.service');
const { createTestVariant } = require('../../helpers/factories');

const stockOf = async (id) => {
  const [row] = await sequelize.query(
    'SELECT stock_quantity, reserved_quantity FROM product_variants WHERE id = :id',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row;
};

describe('confirm / release (real Postgres)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should deduct stock and write an audit row given a confirmed reservation (AC1)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    expect(await confirmReservation(r.reservation_id)).toBe(true);

    expect(await stockOf(v.id)).toEqual({ stock_quantity: 3, reserved_quantity: 0 });
    const [log] = await sequelize.query(
      'SELECT change_quantity FROM inventory_logs WHERE product_variant_id = :id',
      { replacements: { id: v.id }, type: QueryTypes.SELECT }
    );
    expect(log.change_quantity).toBe(-2);
  });

  it('should restore availability given a released reservation (AC2)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    expect(await releaseReservation(r.reservation_id)).toBe(true);

    expect(await stockOf(v.id)).toEqual({ stock_quantity: 5, reserved_quantity: 0 });
  });

  it('should not double-apply given a second confirm or release (AC3)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 2 }] });

    await confirmReservation(r.reservation_id);

    expect(await confirmReservation(r.reservation_id)).toBe(false);
    expect(await releaseReservation(r.reservation_id)).toBe(false);
    expect(await stockOf(v.id)).toEqual({ stock_quantity: 3, reserved_quantity: 0 });
  });

  it('should let exactly one of concurrent confirm and release win (AC5)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] });

    const results = await Promise.all([
      confirmReservation(r.reservation_id),
      releaseReservation(r.reservation_id),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const stock = await stockOf(v.id);
    expect(stock.reserved_quantity).toBe(0);
    expect([4, 5]).toContain(stock.stock_quantity); // 4 if confirm won, 5 if release won
  });

  it('should refuse to confirm after the reservation expired and was swept (AC4)', async () => {
    const v = await createTestVariant({ stockQuantity: 5 });
    const r = await reserveStock({ items: [{ variant_id: v.id, quantity: 1 }] });
    await sequelize.query(`UPDATE stock_reservations SET status = 'EXPIRED' WHERE id = :id`, {
      replacements: { id: r.reservation_id },
    });

    expect(await confirmReservation(r.reservation_id)).toBe(false);
  });
});
