jest.mock('../../../src/models', () => ({
  sequelize: {
    transaction: jest.fn(),
    query: jest.fn(),
  },
}));
jest.mock('../../../src/services/cache.service', () => ({ set: jest.fn(), del: jest.fn() }));
jest.mock('../../../src/config/logger', () => {
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { ...l, logger: l };
});

const { sequelize } = require('../../../src/models');
const cacheService = require('../../../src/services/cache.service');
const reservationService = require('../../../src/services/reservation.service');

const {
  normalizeItems,
  reserveStock,
  confirmReservation,
  releaseReservation,
  releaseExpiredReservations,
  releaseCustomerActiveReservations,
} = reservationService;

describe('normalizeItems', () => {
  it('should merge duplicate variants and sort by id', () => {
    const result = normalizeItems([
      { variant_id: 9, quantity: 1 },
      { variant_id: 3, quantity: 2 },
      { variant_id: 9, quantity: 2 },
    ]);

    expect(result).toEqual([
      { variantId: 3, quantity: 2 },
      { variantId: 9, quantity: 3 },
    ]);
  });

  it('should throw 400 given an empty list', () => {
    expect(() => normalizeItems([])).toThrow();
    expect(() => normalizeItems(undefined)).toThrow();
  });

  it('should throw given a non-integer or non-positive variant id', () => {
    expect(() => normalizeItems([{ variant_id: 'abc', quantity: 1 }])).toThrow();
    expect(() => normalizeItems([{ variant_id: 0, quantity: 1 }])).toThrow();
  });

  it('should throw given a quantity that is zero, negative or fractional', () => {
    expect(() => normalizeItems([{ variant_id: 1, quantity: 0 }])).toThrow();
    expect(() => normalizeItems([{ variant_id: 1, quantity: -2 }])).toThrow();
    expect(() => normalizeItems([{ variant_id: 1, quantity: 1.5 }])).toThrow();
  });
});

describe('reserveStock', () => {
  let t;

  beforeEach(() => {
    jest.clearAllMocks();
    t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
  });

  const variantRow = (stock, reserved) => [
    { id: 1, sku: 'SKU-1', stock_quantity: stock, reserved_quantity: reserved },
  ];

  it('should reserve and cache given enough stock', async () => {
    sequelize.query.mockResolvedValueOnce(variantRow(5, 0)).mockResolvedValue([]);

    const result = await reserveStock({ customerId: 7, items: [{ variant_id: 1, quantity: 2 }] });

    expect(result.reservation_id).toMatch(/^res_/);
    expect(result.expires_in).toBe(900);
    expect(t.commit).toHaveBeenCalled();
    expect(t.rollback).not.toHaveBeenCalled();
    expect(cacheService.set).toHaveBeenCalledWith(
      expect.stringMatching(/^reservation:res_/),
      expect.any(Object),
      900
    );
  });

  it('should throw 409 and roll back given insufficient stock', async () => {
    sequelize.query.mockResolvedValueOnce(variantRow(5, 4));

    await expect(reserveStock({ items: [{ variant_id: 1, quantity: 3 }] })).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(t.rollback).toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('should throw 404 given an unknown variant', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await expect(reserveStock({ items: [{ variant_id: 99, quantity: 1 }] })).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(t.rollback).toHaveBeenCalled();
  });

  it('should lock variants in ascending id order', async () => {
    sequelize.query.mockResolvedValue([
      { id: 1, sku: 'S', stock_quantity: 9, reserved_quantity: 0 },
    ]);

    await reserveStock({
      items: [
        { variant_id: 8, quantity: 1 },
        { variant_id: 2, quantity: 1 },
      ],
    });

    const lockCalls = sequelize.query.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE'));
    expect(lockCalls[0][1].replacements.id).toBe(2);
    expect(lockCalls[1][1].replacements.id).toBe(8);
  });

  it('should still succeed given Redis fails after commit', async () => {
    sequelize.query.mockResolvedValueOnce(variantRow(5, 0)).mockResolvedValue([]);
    cacheService.set.mockRejectedValueOnce(new Error('redis down'));

    const result = await reserveStock({ items: [{ variant_id: 1, quantity: 1 }] });

    expect(result.reservation_id).toBeDefined();
    expect(t.commit).toHaveBeenCalled();
  });

  it('should roll back given a database error mid-way', async () => {
    sequelize.query
      .mockResolvedValueOnce(variantRow(5, 0))
      .mockRejectedValueOnce(new Error('db boom'));

    await expect(reserveStock({ items: [{ variant_id: 1, quantity: 1 }] })).rejects.toThrow(
      'db boom'
    );

    expect(t.rollback).toHaveBeenCalled();
  });
});

describe('confirmReservation / releaseReservation', () => {
  let t;

  // Routes each mocked query by its SQL text, so tests don't depend on call order
  const mockDb = ({ reservation, items = [{ variant_id: 1, quantity: 2 }] }) => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM stock_reservations')) return reservation ? [reservation] : [];
      if (sql.includes('FROM reservation_items')) return items;
      return [];
    });
  };

  const sqlCalls = () => sequelize.query.mock.calls.map(([sql]) => sql);

  beforeEach(() => {
    jest.clearAllMocks();
    t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
  });

  it('should deduct stock and log it given an ACTIVE reservation is confirmed', async () => {
    mockDb({ reservation: { id: 'res_1', customer_id: 7, status: 'ACTIVE' } });

    const result = await confirmReservation('res_1', { customerId: 7 });

    expect(result).toBe(true);
    const sqls = sqlCalls();
    expect(sqls.some((s) => s.includes('stock_quantity = stock_quantity - :qty'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO inventory_logs'))).toBe(true);
    expect(t.commit).toHaveBeenCalled();
  });

  it('should only free reserved units given a release (no stock change, no log)', async () => {
    mockDb({ reservation: { id: 'res_1', customer_id: 7, status: 'ACTIVE' } });

    const result = await releaseReservation('res_1', { customerId: 7 });

    expect(result).toBe(true);
    const sqls = sqlCalls();
    expect(sqls.some((s) => s.includes('stock_quantity = stock_quantity - :qty'))).toBe(false);
    expect(sqls.some((s) => s.includes('reserved_quantity = reserved_quantity - :qty'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO inventory_logs'))).toBe(false);
  });

  it.each(['CONFIRMED', 'RELEASED', 'EXPIRED'])(
    'should be a no-op returning false given a %s reservation',
    async (status) => {
      mockDb({ reservation: { id: 'res_1', customer_id: 7, status } });

      expect(await confirmReservation('res_1')).toBe(false);

      expect(sqlCalls().some((s) => s.includes('UPDATE product_variants'))).toBe(false);
      expect(t.rollback).toHaveBeenCalled();
      expect(t.commit).not.toHaveBeenCalled();
    }
  );

  it('should throw 404 given an unknown reservation', async () => {
    mockDb({ reservation: null });

    await expect(confirmReservation('nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should throw 403 given another customer owns the reservation', async () => {
    mockDb({ reservation: { id: 'res_1', customer_id: 7, status: 'ACTIVE' } });

    await expect(releaseReservation('res_1', { customerId: 8 })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(sqlCalls().some((s) => s.includes('UPDATE product_variants'))).toBe(false);
  });

  it('should throw 403 given a customer settles an ownerless reservation', async () => {
    mockDb({ reservation: { id: 'res_1', customer_id: null, status: 'ACTIVE' } });

    await expect(releaseReservation('res_1', { customerId: 7 })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('should roll back given a database error while updating stock', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM stock_reservations')) {
        return [{ id: 'res_1', customer_id: null, status: 'ACTIVE' }];
      }
      if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 2 }];
      if (sql.includes('UPDATE product_variants')) throw new Error('check violated');
      return [];
    });

    await expect(confirmReservation('res_1')).rejects.toThrow('check violated');

    expect(t.rollback).toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
  });

  it('should still succeed given Redis delete fails after commit', async () => {
    mockDb({ reservation: { id: 'res_1', customer_id: null, status: 'ACTIVE' } });
    cacheService.del.mockRejectedValueOnce(new Error('redis down'));

    expect(await releaseReservation('res_1')).toBe(true);
  });
});

describe('EXPIRE mode and releaseExpiredReservations', () => {
  let t;

  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.query.mockReset();
    t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
  });

  const sqlCalls = () => sequelize.query.mock.calls.map(([sql]) => sql);

  it('should return 0 given nothing is expired', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    expect(await releaseExpiredReservations()).toBe(0);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('should release each expired hold and count them', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('LIMIT :batchSize')) return [{ id: 'res_1' }, { id: 'res_2' }];
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return [{ id: 'res_x', customer_id: null, status: 'ACTIVE', is_expired: true }];
      }
      if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 2 }];
      return [];
    });

    expect(await releaseExpiredReservations()).toBe(2);

    const sqls = sqlCalls();
    expect(sqls.some((s) => s.includes('stock_quantity = stock_quantity - :qty'))).toBe(false);
    expect(sqls.some((s) => s.includes('INSERT INTO inventory_logs'))).toBe(false);
    expect(t.commit).toHaveBeenCalledTimes(2);
  });

  it('should skip a hold locked by another worker', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('LIMIT :batchSize')) return [{ id: 'res_1' }];
      if (sql.includes('FOR UPDATE SKIP LOCKED')) return []; // locked elsewhere
      return [];
    });

    expect(await releaseExpiredReservations()).toBe(0);
    expect(t.rollback).toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
  });

  it('should skip a hold that is no longer expired when locked', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('LIMIT :batchSize')) return [{ id: 'res_1' }];
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return [{ id: 'res_1', customer_id: null, status: 'ACTIVE', is_expired: false }];
      }
      return [];
    });

    expect(await releaseExpiredReservations()).toBe(0);
    expect(sqlCalls().some((s) => s.includes('UPDATE product_variants'))).toBe(false);
  });

  it('should keep going given one reservation fails', async () => {
    let lockCalls = 0;
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('LIMIT :batchSize')) return [{ id: 'res_1' }, { id: 'res_2' }];
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        lockCalls += 1;
        if (lockCalls === 1) throw new Error('db boom');
        return [{ id: 'res_2', customer_id: null, status: 'ACTIVE', is_expired: true }];
      }
      if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 1 }];
      return [];
    });

    expect(await releaseExpiredReservations()).toBe(1);
  });
});

describe('caps and one-hold-per-customer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.query.mockReset();
  });

  it('should throw given more than 20 items or more than 10 units of one item', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ variant_id: i + 1, quantity: 1 }));
    expect(() => normalizeItems(many)).toThrow();
    expect(() => normalizeItems([{ variant_id: 1, quantity: 11 }])).toThrow();
  });

  it('should accept exactly 20 items and exactly 10 units of one item', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ variant_id: i + 1, quantity: 1 }));
    expect(normalizeItems(twenty)).toHaveLength(20);
    expect(normalizeItems([{ variant_id: 1, quantity: 10 }])).toEqual([
      { variantId: 1, quantity: 10 },
    ]);
  });

  it('should release every active hold the customer has', async () => {
    const t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes("customer_id = :customerId AND status = 'ACTIVE'")) {
        return [{ id: 'res_1' }, { id: 'res_2' }];
      }
      if (sql.includes('FROM stock_reservations WHERE id')) {
        return [{ id: 'x', customer_id: 7, status: 'ACTIVE' }];
      }
      if (sql.includes('FROM reservation_items')) return [{ variant_id: 1, quantity: 1 }];
      return [];
    });

    expect(await releaseCustomerActiveReservations(7)).toBe(2);
    expect(t.commit).toHaveBeenCalledTimes(2);
  });

  it('should return 0 given the customer has no active holds', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    expect(await releaseCustomerActiveReservations(7)).toBe(0);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
