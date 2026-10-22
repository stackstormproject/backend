jest.mock('../../../src/models', () => ({
  sequelize: {
    transaction: jest.fn(),
    query: jest.fn(),
  },
}));
jest.mock('../../../src/services/cache.service', () => ({ set: jest.fn() }));
jest.mock('../../../src/config/logger', () => {
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { ...l, logger: l };
});

const { sequelize } = require('../../../src/models');
const cacheService = require('../../../src/services/cache.service');
const reservationService = require('../../../src/services/reservation.service');

const { normalizeItems, reserveStock } = reservationService;

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
