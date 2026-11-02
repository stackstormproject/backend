jest.mock('../../../src/models', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../src/services/order.service', () => ({
  generateInvoiceNumber: jest.fn(({ id }) => `DFC-2026-${String(id).padStart(4, '0')}`),
}));

const { sequelize } = require('../../../src/models');
const { getAnalyticsOverview, getSalesTrend } = require('../../../src/services/analytics.service');

// Refs #134: dashboard figures come from SQL aggregates over paid orders only.
const answer = (sql) => {
  if (sql.includes('FROM order_items')) {
    return [{ id: 3, name: 'RTX 4070', units: 2, revenue: 290000.456 }];
  }
  if (sql.includes('LEFT JOIN customers')) {
    return [
      {
        id: 12,
        status: 'shipped',
        total_amount: 4650,
        order_date: '2026-10-27',
        customer_name: 'Alice',
      },
    ];
  }
  if (sql.includes('SUM(total_amount)')) return [{ orders: 4, revenue: 300000 }];
  if (sql.includes('FROM returns')) return [{ open: 1, total: 2 }];
  return [{ count: 7 }];
};

describe('analyticsService.getAnalyticsOverview', () => {
  beforeEach(() => {
    sequelize.query.mockReset();
    sequelize.query.mockImplementation(async (sql) => answer(sql));
  });

  it('should compute revenue, average order value and return rate from paid orders', async () => {
    const result = await getAnalyticsOverview();

    expect(result.metrics).toMatchObject({
      total_revenue: 300000,
      formatted_revenue: 'LKR 300,000.00',
      paid_orders: 4,
      awaiting_payment: 7,
      active_customers: 7,
      average_order_value: 75000,
      return_rate_percentage: 50,
      open_returns: 1,
      low_stock_count: 7,
      support_queue_count: 7,
    });
    expect(sequelize.query.mock.calls[0][1].replacements.paid).toEqual([
      'confirmed',
      'processing',
      'shipped',
      'delivered',
    ]);
  });

  it('should list top products and recent orders with invoice numbers', async () => {
    const result = await getAnalyticsOverview();

    expect(result.top_products).toEqual([
      { product_id: 3, title: 'RTX 4070', units_sold: 2, revenue: 290000.46 },
    ]);
    expect(result.recent_orders[0]).toMatchObject({
      invoice_number: 'DFC-2026-0012',
      customer_name: 'Alice',
    });
  });

  it('should report zero averages when nothing has been paid yet', async () => {
    sequelize.query.mockImplementation(async (sql) =>
      sql.includes('SUM(total_amount)') ? [{ orders: 0, revenue: 0 }] : answer(sql)
    );

    const { metrics } = await getAnalyticsOverview();

    expect(metrics.average_order_value).toBe(0);
    expect(metrics.return_rate_percentage).toBe(0);
  });
});

describe('analyticsService.getSalesTrend', () => {
  beforeEach(() => sequelize.query.mockReset());

  it('should total the daily series', async () => {
    sequelize.query.mockResolvedValue([
      { date: '2026-10-26', revenue: 1000.5, orders: 1 },
      { date: '2026-10-27', revenue: 249.254, orders: 2 },
    ]);

    const result = await getSalesTrend(2);

    expect(result).toEqual({
      days: 2,
      series: expect.any(Array),
      totals: { revenue: 1249.75, orders: 3 },
    });
    expect(sequelize.query.mock.calls[0][1].replacements.span).toBe(2);
  });

  it('should clamp the window to between 1 and 365 days', async () => {
    sequelize.query.mockResolvedValue([]);

    expect((await getSalesTrend(9999)).days).toBe(365);
    expect((await getSalesTrend(-5)).days).toBe(1);
    expect((await getSalesTrend('abc')).days).toBe(30);
    expect((await getSalesTrend()).days).toBe(30);
  });
});
