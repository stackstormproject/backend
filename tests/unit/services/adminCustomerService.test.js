jest.mock('../../../src/models', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../../../src/services/order.service', () => ({
  generateInvoiceNumber: ({ id }) => `DFC-2026-${String(id).padStart(4, '0')}`,
}));

const { sequelize } = require('../../../src/models');
const service = require('../../../src/services/adminCustomer.service');

// Refs #138: customer search (unit level; spending figures against real orders are in
// tests/integration/admin/customers.test.js).
const summary = (overrides = {}) => ({
  id: 4,
  name: 'Alice',
  email: 'alice@example.com',
  phone: '0771234567',
  created_at: '2026-01-01',
  tier: 'gold',
  points: 120,
  order_count: 3,
  total_spent: '13950.5',
  last_order_at: '2026-10-27',
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('adminCustomerService.listCustomers', () => {
  it('should list customers newest first with default paging', async () => {
    sequelize.query.mockResolvedValueOnce([summary()]).mockResolvedValueOnce([{ total: 1 }]);

    const result = await service.listCustomers();

    expect(result.customers[0]).toMatchObject({ id: 4, total_spent: 13950.5, tier: 'gold' });
    expect(result.pagination).toEqual({ total: 1, page: 1, limit: 20, total_pages: 1 });
    expect(sequelize.query.mock.calls[0][0]).toMatch(/ORDER BY c\.created_at DESC/);
    expect(sequelize.query.mock.calls[0][0]).not.toMatch(/ILIKE/);
  });

  it('should search, filter by tier and sort by spend', async () => {
    sequelize.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

    await service.listCustomers({
      search: ' ali ',
      tier: 'gold',
      sort: 'spend',
      page: '2',
      limit: '500',
    });
    const [sql, { replacements }] = sequelize.query.mock.calls[0];

    expect(sql).toMatch(/c\.name ILIKE :like/);
    expect(sql).toMatch(/= :tier/);
    expect(sql).toMatch(/ORDER BY total_spent DESC/);
    expect(replacements).toEqual({ like: '%ali%', tier: 'gold', limit: 100, offset: 100 });
  });

  it('should ignore an unknown tier and sort', async () => {
    sequelize.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

    await service.listCustomers({ tier: 'diamond', sort: 'random' });

    expect(sequelize.query.mock.calls[0][1].replacements.tier).toBeNull();
    expect(sequelize.query.mock.calls[0][0]).toMatch(/ORDER BY c\.created_at DESC/);
  });
});

describe('adminCustomerService.getCustomer', () => {
  it('should return 404 for a missing or deleted customer', async () => {
    sequelize.query.mockResolvedValueOnce([]);

    await expect(service.getCustomer(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should add recent orders, addresses and points history', async () => {
    sequelize.query
      .mockResolvedValueOnce([summary()])
      .mockResolvedValueOnce([
        { id: 12, order_date: '2026-10-27', status: 'shipped', total_amount: '4650.00' },
      ])
      .mockResolvedValueOnce([{ id: 1, city: 'Colombo' }])
      .mockResolvedValueOnce([{ id: 5, points: 50 }]);

    const result = await service.getCustomer(4);

    expect(result.recent_orders).toEqual([
      {
        id: 12,
        invoice_number: 'DFC-2026-0012',
        order_date: '2026-10-27',
        status: 'shipped',
        total_amount: 4650,
      },
    ]);
    expect(result.addresses).toEqual([{ id: 1, city: 'Colombo' }]);
    expect(result.loyalty_transactions).toEqual([{ id: 5, points: 50 }]);
  });
});
