jest.mock('../../../src/models', () => ({
  Return: { findByPk: jest.fn() },
  Order: { findByPk: jest.fn() },
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../../src/services/stripe.service', () => ({ refundOrderPayment: jest.fn() }));
jest.mock('../../../src/services/order.service', () => ({
  generateInvoiceNumber: ({ id }) => `DFC-2026-${String(id).padStart(4, '0')}`,
}));

const { Return, Order, sequelize } = require('../../../src/models');
const { refundOrderPayment } = require('../../../src/services/stripe.service');
const service = require('../../../src/services/adminReturn.service');

// Refs #137: approve, reject and receive rules for returns and exchanges (unit level; the
// stock movements against a real database are in tests/integration/admin/returns.test.js).
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const row = (overrides = {}) => ({
  id: 8,
  type: 'return',
  status: 'approved',
  reason: 'Too small',
  refund_amount: '4500.00',
  order_id: 12,
  order_date: '2026-10-01',
  customer_id: 4,
  customer_name: 'Alice',
  order_item_id: 30,
  product_variant_id: 21,
  quantity: 1,
  subtotal: '4500.00',
  exchange_variant_id: null,
  ...overrides,
});
const record = (overrides = {}) => ({
  id: 8,
  type: 'return',
  status: 'approved',
  adminNote: 'old note',
  refundAmount: '4500.00',
  exchangeVariantId: null,
  update: jest.fn(),
  ...overrides,
});
// Answers the detail query with `view` and every other statement with `other`.
const answer = (view, other = []) =>
  sequelize.query.mockImplementation(async (sql) =>
    sql.includes('FROM returns r') && sql.includes('WHERE r.id') ? [view] : other
  );

beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
});

describe('adminReturnService.listReturns', () => {
  it('should list open requests first with default paging', async () => {
    sequelize.query
      .mockResolvedValueOnce([row(), row({ id: 9, type: 'exchange', exchange_variant_id: 22 })])
      .mockResolvedValueOnce([{ total: 2 }]);

    const result = await service.listReturns();

    expect(result.returns[0]).toMatchObject({
      refund_amount: 4500,
      exchange: null,
      order: { invoice_number: 'DFC-2026-0012' },
      item: { subtotal: 4500 },
    });
    expect(result.returns[1].exchange).toMatchObject({ variant_id: 22 });
    expect(result.pagination).toEqual({ total: 2, page: 1, limit: 20, total_pages: 1 });
    expect(sequelize.query.mock.calls[1][0]).not.toMatch(/WHERE/);
  });

  it('should filter by a known status and ignore an unknown one', async () => {
    sequelize.query.mockResolvedValue([{ total: 0 }]);

    await service.listReturns({ status: 'requested', page: '2', limit: '500' });
    await service.listReturns({ status: 'lost' });

    expect(sequelize.query.mock.calls[0][1].replacements).toEqual({
      status: 'requested',
      limit: 100,
      offset: 100,
    });
    expect(sequelize.query.mock.calls[2][1].replacements.status).toBeNull();
  });
});

describe('adminReturnService.getReturn', () => {
  it('should return 404 for a missing return', async () => {
    sequelize.query.mockResolvedValue([]);

    await expect(service.getReturn(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should treat a missing refund amount as zero', async () => {
    sequelize.query.mockResolvedValue([row({ refund_amount: null })]);

    await expect(service.getReturn(8)).resolves.toMatchObject({ refund_amount: 0 });
  });
});

describe('adminReturnService.approveReturn', () => {
  it('should return 404 for a missing return', async () => {
    Return.findByPk.mockResolvedValue(null);

    await expect(service.approveReturn(99, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should refuse a return that is not waiting for a decision', async () => {
    Return.findByPk.mockResolvedValue(record({ status: 'completed' }));

    await expect(service.approveReturn(8, 1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Return 8 is already completed',
    });
  });

  it('should approve under a row lock with a trimmed note', async () => {
    const pending = record({ status: 'requested' });
    Return.findByPk.mockResolvedValue(pending);
    answer(row());

    await service.approveReturn(8, 1, '  Send it back  ');

    expect(Return.findByPk).toHaveBeenCalledWith(8, { transaction, lock: 'UPDATE' });
    expect(pending.update).toHaveBeenCalledWith(
      { status: 'approved', adminNote: 'Send it back', resolvedBy: 1 },
      { transaction }
    );
  });
});

describe('adminReturnService.rejectReturn', () => {
  it('should require a reason for the customer', async () => {
    await expect(service.rejectReturn(8, 1, ' ')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should resolve the return as rejected', async () => {
    const pending = record({ status: 'requested' });
    Return.findByPk.mockResolvedValue(pending);
    answer(row());

    await service.rejectReturn(8, 1, 'Outside the 14-day window');

    expect(pending.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        adminNote: 'Outside the 14-day window',
        resolvedAt: expect.any(Date),
      }),
      { transaction }
    );
  });
});

describe('adminReturnService.receiveReturn', () => {
  it('should require the inspection result', async () => {
    await expect(service.receiveReturn(8, 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.receiveReturn(8, 1, { acceptable: 'yes' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should require a description of an unacceptable item', async () => {
    await expect(
      service.receiveReturn(8, 1, { acceptable: false, note: '' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject an unacceptable item without moving stock', async () => {
    const approved = record();
    Return.findByPk.mockResolvedValue(approved);
    answer(row());

    const result = await service.receiveReturn(8, 1, { acceptable: false, note: 'Worn' });

    expect(approved.update.mock.calls[0][0]).toMatchObject({
      status: 'rejected',
      adminNote: 'Worn',
    });
    expect(refundOrderPayment).not.toHaveBeenCalled();
    expect(result.refund).toBeNull();
  });

  it('should restock and refund an acceptable return, keeping the earlier note', async () => {
    const approved = record();
    const order = { id: 12 };
    Return.findByPk.mockResolvedValue(approved);
    Order.findByPk.mockResolvedValue(order);
    refundOrderPayment.mockResolvedValue({ refunded: true, amount: 4500 });
    answer(row());

    const result = await service.receiveReturn(8, 1, { acceptable: true });

    const restock = sequelize.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(restock[1].replacements).toEqual({ variantId: 21, change: 1 });
    expect(refundOrderPayment).toHaveBeenCalledWith(order, '4500.00', 'return-8');
    expect(approved.update.mock.calls[0][0]).toMatchObject({
      status: 'completed',
      adminNote: 'old note',
    });
    expect(result.refund).toEqual({ refunded: true, amount: 4500 });
  });

  it('should send the replacement of an exchange when it is in stock', async () => {
    const approved = record({ type: 'exchange', exchangeVariantId: 22 });
    Return.findByPk.mockResolvedValue(approved);
    answer(row({ type: 'exchange', exchange_variant_id: 22 }), [{ available: 3 }]);

    await service.receiveReturn(8, 1, { acceptable: true });

    const moves = sequelize.query.mock.calls
      .filter(([sql]) => sql.startsWith('UPDATE'))
      .map(([, opts]) => opts.replacements);
    expect(moves).toEqual([
      { variantId: 21, change: 1 },
      { variantId: 22, change: -1 },
    ]);
    expect(refundOrderPayment).not.toHaveBeenCalled();
    expect(approved.update.mock.calls[0][0].status).toBe('completed');
  });

  it.each([[[]], [[{ available: 0 }]]])(
    'should refuse an exchange whose replacement is out of stock (%p)',
    async (replacement) => {
      const approved = record({ type: 'exchange', exchangeVariantId: 22 });
      Return.findByPk.mockResolvedValue(approved);
      answer(row({ type: 'exchange' }), replacement);

      await expect(service.receiveReturn(8, 1, { acceptable: true })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(approved.update).not.toHaveBeenCalled();
    }
  );
});
