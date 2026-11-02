jest.mock('../../../src/models', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

const { sequelize } = require('../../../src/models');
const {
  ADJUSTMENT_REASONS,
  listInventory,
  adjustStock,
  listLogs,
} = require('../../../src/services/adminInventory.service');

// Refs #135: stock list, audited adjustments and change history (unit level; locking and
// the inventory_logs rows are covered by tests/integration/admin/inventory.test.js).
const transaction = {};
const variantRow = (overrides = {}) => ({
  variant_id: 9,
  product_id: 3,
  product_name: 'RTX 4070',
  sku: 'RTX-4070-12G',
  size: null,
  color: 'Black',
  stock_quantity: 10,
  reserved_quantity: 2,
  ...overrides,
});

beforeEach(() => {
  sequelize.query.mockReset();
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
});

describe('adminInventoryService.listInventory', () => {
  it('should map rows with availability and paginate with defaults', async () => {
    sequelize.query
      .mockResolvedValueOnce([variantRow(), variantRow({ variant_id: 10, stock_quantity: 6 })])
      .mockResolvedValueOnce([{ total: 2 }]);

    const result = await listInventory();

    expect(result.items[0]).toMatchObject({ variant_id: 9, available: 8, is_low: false });
    expect(result.items[1]).toMatchObject({ available: 4, is_low: true });
    expect(result.pagination).toEqual({ total: 2, page: 1, limit: 50, total_pages: 1 });
    expect(sequelize.query.mock.calls[0][0]).not.toMatch(/WHERE/);
  });

  it('should filter by search and low stock, lowest first', async () => {
    sequelize.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

    const result = await listInventory({ search: ' rtx ', low: 'true', page: '2', limit: '500' });
    const [sql, { replacements }] = sequelize.query.mock.calls[0];

    expect(sql).toContain('ILIKE :like) AND v.stock_quantity - v.reserved_quantity <= :threshold');
    expect(sql).toMatch(/ORDER BY v\.stock_quantity - v\.reserved_quantity ASC/);
    expect(replacements).toMatchObject({ like: '%rtx%', limit: 100, offset: 100 });
    expect(result.pagination.total_pages).toBe(1);
  });
});

describe('adminInventoryService.adjustStock', () => {
  it.each([0, 1.5, 'x', 10001, -10001])('should reject a change of %p', async (delta) => {
    await expect(adjustStock(9, { delta, reason: 'restock' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should reject an unknown reason', async () => {
    await expect(adjustStock(9, { delta: 1, reason: 'gift' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should require a note for an "other" adjustment', async () => {
    await expect(adjustStock(9, { delta: 1, reason: 'other', note: '   ' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('should return 404 for a missing variant', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await expect(adjustStock(99, { delta: 1, reason: 'restock' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('should not let stock drop below the units held in checkouts', async () => {
    sequelize.query.mockResolvedValueOnce([variantRow()]);

    await expect(adjustStock(9, { delta: -9, reason: 'damaged' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(sequelize.query).toHaveBeenCalledTimes(1);
  });

  it('should update the stock and log the change with the note', async () => {
    sequelize.query.mockResolvedValueOnce([variantRow()]);

    const result = await adjustStock(9, {
      delta: '5',
      reason: 'other',
      note: ' found in back room ',
      adminId: 1,
    });

    expect(sequelize.query.mock.calls[1][1].replacements).toEqual({ next: 15, id: 9 });
    expect(sequelize.query.mock.calls[2][1].replacements).toEqual({
      id: 9,
      adminId: 1,
      change: 5,
      reason: 'other: found in back room',
    });
    expect(result).toMatchObject({ stock_quantity: 15, available: 13 });
  });

  it('should log the bare reason when there is no note', async () => {
    sequelize.query.mockResolvedValueOnce([variantRow()]);

    await adjustStock(9, { delta: -1, reason: ADJUSTMENT_REASONS[1] });

    expect(sequelize.query.mock.calls[2][1].replacements.reason).toBe('damaged');
  });
});

describe('adminInventoryService.listLogs', () => {
  it('should cap the history size', async () => {
    sequelize.query.mockResolvedValue([]);

    await listLogs(9, 1000);
    await listLogs(9);
    await listLogs(9, 'abc');

    expect(sequelize.query.mock.calls.map((c) => c[1].replacements.limit)).toEqual([200, 50, 50]);
  });
});
