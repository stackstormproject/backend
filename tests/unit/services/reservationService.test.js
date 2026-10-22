jest.mock('../../../src/models', () => ({
  sequelize: {
    transaction: jest.fn(),
    query: jest.fn(),
  },
}));
jest.mock('../../../src/services/cache.service', () => ({ set: jest.fn(), del: jest.fn() }));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sequelize } = require('../../../src/models');
const cacheService = require('../../../src/services/cache.service');
const logger = require('../../../src/config/logger');
const reservationService = require('../../../src/services/reservation.service');

const { normalizeItems, reserveStock, confirmReservation, releaseReservation } = reservationService;

const makeTransaction = () => ({ commit: jest.fn(), rollback: jest.fn() });

describe('normalizeItems', () => {
  it('merges duplicate variants and sorts by id', () => {
    expect(
      normalizeItems([
        { variant_id: 9, quantity: 1 },
        { variant_id: 3, quantity: 2 },
        { variant_id: 9, quantity: 2 },
      ])
    ).toEqual([
      { variantId: 3, quantity: 2 },
      { variantId: 9, quantity: 3 },
    ]);
  });

  it('accepts camel-case variant ids', () => {
    expect(normalizeItems([{ variantId: '5', quantity: '3' }])).toEqual([
      { variantId: 5, quantity: 3 },
    ]);
  });

  it.each([undefined, null, {}, []])('rejects an empty or invalid item list: %p', (items) => {
    expect(() => normalizeItems(items)).toThrow();
  });

  it.each(['abc', 0, -1, 1.5])('rejects invalid variant id %p', (variantId) => {
    expect(() => normalizeItems([{ variant_id: variantId, quantity: 1 }])).toThrow();
  });

  it.each([0, -1, 1.5, 'abc'])('rejects invalid quantity %p', (quantity) => {
    expect(() => normalizeItems([{ variant_id: 1, quantity }])).toThrow();
  });
});

describe('reserveStock', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = makeTransaction();
    sequelize.transaction.mockResolvedValue(transaction);
  });

  it('reserves stock, writes its ledger, and caches the reservation', async () => {
    sequelize.query.mockResolvedValueOnce([
      { id: 1, sku: 'SKU-1', stock_quantity: 5, reserved_quantity: 0 },
    ]);

    const result = await reserveStock({
      customerId: 7,
      orderId: 9,
      items: [{ variant_id: 1, quantity: 2 }],
    });

    expect(result).toMatchObject({
      order_id: 9,
      expires_in: 900,
      items: [{ variantId: 1, quantity: 2 }],
    });
    expect(result.reservation_id).toMatch(/^res_/);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reservation_items'),
      expect.objectContaining({ transaction })
    );
    expect(cacheService.set).toHaveBeenCalledWith(
      expect.stringMatching(/^reservation:res_/),
      expect.any(Object),
      900
    );
  });

  it('locks variants in ascending id order', async () => {
    sequelize.query.mockResolvedValue([
      { id: 2, sku: 'SKU-2', stock_quantity: 9, reserved_quantity: 0 },
    ]);

    await reserveStock({
      items: [
        { variant_id: 8, quantity: 1 },
        { variant_id: 2, quantity: 1 },
      ],
    });

    const lockCalls = sequelize.query.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE'));
    expect(lockCalls.map(([, options]) => options.replacements.id)).toEqual([2, 8]);
  });

  it('throws and rolls back when a variant does not exist', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await expect(reserveStock({ items: [{ variant_id: 99, quantity: 1 }] })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('throws and rolls back when stock is insufficient', async () => {
    sequelize.query.mockResolvedValueOnce([
      { id: 1, sku: 'SKU-1', stock_quantity: 5, reserved_quantity: 4 },
    ]);

    await expect(reserveStock({ items: [{ variant_id: 1, quantity: 3 }] })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('throws and rolls back on a database error', async () => {
    sequelize.query.mockRejectedValueOnce(new Error('db failure'));

    await expect(reserveStock({ items: [{ variant_id: 1, quantity: 1 }] })).rejects.toThrow(
      'db failure'
    );
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('keeps the committed reservation when the Redis write fails', async () => {
    sequelize.query.mockResolvedValueOnce([
      { id: 1, sku: 'SKU-1', stock_quantity: 5, reserved_quantity: 0 },
    ]);
    cacheService.set.mockRejectedValueOnce(new Error('redis down'));

    await expect(reserveStock({ items: [{ variant_id: 1, quantity: 1 }] })).resolves.toMatchObject({
      expires_in: 900,
    });
    expect(transaction.commit).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('confirmReservation and releaseReservation', () => {
  let transaction;

  const mockReservation = ({
    reservation = { id: 'res_1', customer_id: 7, status: 'ACTIVE', is_expired: false },
    items = [{ variant_id: 1, quantity: 2 }],
  } = {}) => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM stock_reservations')) return reservation ? [reservation] : [];
      if (sql.includes('FROM reservation_items')) return items;
      return [];
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = makeTransaction();
    sequelize.transaction.mockResolvedValue(transaction);
  });

  it('deducts stock and writes an inventory log when confirming', async () => {
    mockReservation();

    await expect(confirmReservation('res_1', { customerId: 7 })).resolves.toBe(true);

    expect(
      sequelize.query.mock.calls.some(([sql]) =>
        sql.includes('stock_quantity = stock_quantity - :qty')
      )
    ).toBe(true);
    expect(
      sequelize.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO inventory_logs'))
    ).toBe(true);
    expect(transaction.commit).toHaveBeenCalled();
    expect(cacheService.del).toHaveBeenCalledWith('reservation:res_1');
  });

  it('frees reserved units without changing stock when releasing', async () => {
    mockReservation();

    await expect(releaseReservation('res_1', { customerId: 7 })).resolves.toBe(true);

    const sql = sequelize.query.mock.calls.map(([query]) => query).join('\n');
    expect(sql).toContain('reserved_quantity = reserved_quantity - :qty');
    expect(sql).not.toContain('INSERT INTO inventory_logs');
  });

  it.each(['CONFIRMED', 'RELEASED', 'EXPIRED'])(
    'does nothing when reservation status is %s',
    async (status) => {
      mockReservation({ reservation: { id: 'res_1', customer_id: 7, status } });

      await expect(confirmReservation('res_1')).resolves.toBe(false);
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    }
  );

  it('returns false when an expiry sweep cannot lock the reservation', async () => {
    sequelize.query.mockResolvedValueOnce([{ id: 'res_1' }]).mockResolvedValueOnce([]);

    await expect(reservationService.releaseExpiredReservations()).resolves.toBe(0);
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('returns false when the reservation has not expired yet', async () => {
    mockReservation();

    await expect(reservationService.releaseExpiredReservations()).resolves.toBe(0);
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('throws not found for a missing reservation during confirmation', async () => {
    mockReservation({ reservation: null });

    await expect(confirmReservation('missing')).rejects.toMatchObject({ statusCode: 404 });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws forbidden when another customer owns the reservation', async () => {
    mockReservation();

    await expect(releaseReservation('res_1', { customerId: 8 })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('allows settlement when the reservation is not customer-owned', async () => {
    mockReservation({ reservation: { id: 'res_1', customer_id: null, status: 'ACTIVE' } });

    await expect(releaseReservation('res_1', { customerId: 8 })).resolves.toBe(true);
  });

  it('keeps the settlement successful when Redis cleanup fails', async () => {
    mockReservation();
    cacheService.del.mockRejectedValueOnce(new Error('redis down'));

    await expect(releaseReservation('res_1')).resolves.toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rolls back and rethrows when updating stock fails', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM stock_reservations')) {
        return [{ id: 'res_1', customer_id: null, status: 'ACTIVE', is_expired: false }];
      }
      if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 2 }];
      if (sql.includes('UPDATE product_variants')) throw new Error('stock update failed');
      return [];
    });

    await expect(confirmReservation('res_1')).rejects.toThrow('stock update failed');
    expect(transaction.rollback).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('releaseExpiredReservations', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = makeTransaction();
    sequelize.transaction.mockResolvedValue(transaction);
  });

  it('returns zero when there are no expired reservations', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await expect(reservationService.releaseExpiredReservations()).resolves.toBe(0);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('releases expired reservations and continues after a settlement error', async () => {
    sequelize.query
      .mockResolvedValueOnce([{ id: 'res_1' }, { id: 'res_2' }])
      .mockImplementation(async (sql, options = {}) => {
        if (sql.includes('FROM stock_reservations')) {
          if (sql.includes('FOR UPDATE')) {
            if (options.replacements.id === 'res_1') {
              throw new Error('temporary database error');
            }
            return [{ id: 'res_2', customer_id: null, status: 'ACTIVE', is_expired: true }];
          }
          return [];
        }
        if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 1 }];
        return [];
      });

    await expect(reservationService.releaseExpiredReservations()).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to expire res_1'));
  });

  it('uses the requested batch size', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await reservationService.releaseExpiredReservations(25);

    expect(sequelize.query.mock.calls[0][1].replacements.batchSize).toBe(25);
  });
});
