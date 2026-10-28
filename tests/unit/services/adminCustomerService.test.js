jest.mock('../../../src/models', () => ({
  Loyalty: { findOne: jest.fn(), create: jest.fn() },
  LoyaltyTransaction: { create: jest.fn() },
  Customer: { findByPk: jest.fn() },
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../../src/services/order.service', () => ({
  generateInvoiceNumber: ({ id }) => `DFC-2026-${String(id).padStart(4, '0')}`,
}));

const { Loyalty, LoyaltyTransaction, Customer, sequelize } = require('../../../src/models');
const service = require('../../../src/services/adminCustomer.service');

// Refs #138: customer search and audited loyalty corrections (unit level; spending figures
// against real orders are in tests/integration/admin/customers.test.js).
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
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
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
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

describe('adminCustomerService.adjustPoints', () => {
  const customer = { id: 4, update: jest.fn() };
  const account = (overrides = {}) => ({
    currentPoints: 100,
    lifetimePoints: 300,
    update: jest.fn(),
    ...overrides,
  });
  const stubDetail = () => sequelize.query.mockResolvedValueOnce([summary()]).mockResolvedValue([]);

  it.each([0, 1.5, 'abc', 100001])('should reject a change of %p points', async (points) => {
    await expect(service.adjustPoints(4, { points, note: 'x' }, 1)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should require a reason', async () => {
    await expect(service.adjustPoints(4, { points: 10, note: '  ' }, 1)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('should return 404 for a missing customer', async () => {
    Customer.findByPk.mockResolvedValue(null);

    await expect(service.adjustPoints(99, { points: 10, note: 'Gift' }, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('should not let a balance go below zero', async () => {
    Customer.findByPk.mockResolvedValue(customer);
    Loyalty.findOne.mockResolvedValue(account());

    await expect(service.adjustPoints(4, { points: -101, note: 'Fraud' }, 1)).rejects.toMatchObject(
      { statusCode: 409, message: 'Only 100 points available to remove' }
    );
  });

  it('should add points to lifetime and log the change with the admin', async () => {
    const loyalty = account();
    Customer.findByPk.mockResolvedValue(customer);
    Loyalty.findOne.mockResolvedValue(loyalty);
    stubDetail();

    await service.adjustPoints(4, { points: '50', note: ' Late delivery ' }, 1);

    expect(Loyalty.findOne).toHaveBeenCalledWith({
      where: { customerId: 4 },
      transaction,
      lock: 'UPDATE',
    });
    expect(loyalty.update).toHaveBeenCalledWith(
      { currentPoints: 150, lifetimePoints: 350 },
      { transaction }
    );
    expect(LoyaltyTransaction.create).toHaveBeenCalledWith(
      {
        customerId: 4,
        points: 50,
        transactionType: 'adjusted',
        description: 'Late delivery',
        adminId: 1,
      },
      { transaction }
    );
    expect(customer.update).toHaveBeenCalledWith({ loyaltyPoints: 150 }, { transaction });
  });

  it('should keep lifetime points when removing points', async () => {
    const loyalty = account();
    Customer.findByPk.mockResolvedValue(customer);
    Loyalty.findOne.mockResolvedValue(loyalty);
    stubDetail();

    await service.adjustPoints(4, { points: -40, note: 'Returned order' }, 1);

    expect(loyalty.update.mock.calls[0][0]).toEqual({ currentPoints: 60, lifetimePoints: 300 });
  });

  it('should open a silver account for a customer without one', async () => {
    const created = account({ currentPoints: 0, lifetimePoints: 0 });
    Customer.findByPk.mockResolvedValue(customer);
    Loyalty.findOne.mockResolvedValue(null);
    Loyalty.create.mockResolvedValue(created);
    stubDetail();

    await service.adjustPoints(4, { points: 25, note: 'Welcome' }, 1);

    expect(Loyalty.create.mock.calls[0][0]).toMatchObject({ customerId: 4, tier: 'silver' });
    expect(created.update.mock.calls[0][0]).toEqual({ currentPoints: 25, lifetimePoints: 25 });
  });
});
