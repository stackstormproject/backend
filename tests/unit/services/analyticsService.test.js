jest.mock('../../../src/models', () => {
  return {
    Order: {
      findAll: jest.fn(),
      findAndCountAll: jest.fn(),
      findByPk: jest.fn(),
    },
    Customer: {
      count: jest.fn(),
    },
    Return: {
      count: jest.fn(),
    },
    OrderItem: {},
    ProductVariant: {},
    Product: {},
  };
});

const { Order, Customer, Return } = require('../../../src/models');
const {
  formatLKR,
  getAnalyticsOverview,
  getAllOrders,
  updateOrderStatus,
} = require('../../../src/services/analytics.service');

describe('analyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatLKR', () => {
    it('formats numbers into LKR format', () => {
      expect(formatLKR(145000)).toBe('LKR 145,000.00');
      expect(formatLKR(0)).toBe('LKR 0.00');
    });
  });

  describe('getAnalyticsOverview', () => {
    it('calculates total revenue, AOV, and top products', async () => {
      Order.findAll.mockResolvedValue([
        {
          id: 1,
          status: 'delivered',
          totalAmount: 12000.0,
          orderDate: new Date(),
          items: [
            {
              quantity: 2,
              unitPrice: 6000.0,
              subtotal: 12000.0,
              variant: { product: { title: 'Batik Shirt' } },
            },
          ],
        },
      ]);
      Customer.count.mockResolvedValue(10);
      Return.count.mockResolvedValue(0);

      const overview = await getAnalyticsOverview();
      expect(overview.metrics.total_revenue).toBe(12000.0);
      expect(overview.metrics.total_orders).toBe(1);
      expect(overview.metrics.active_customers).toBe(10);
      expect(overview.top_products).toHaveLength(1);
      expect(overview.top_products[0].title).toBe('Batik Shirt');
    });
  });

  describe('getAllOrders', () => {
    it('returns paginated orders list', async () => {
      Order.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 1,
            customerId: 4,
            status: 'processing',
            totalAmount: 6000.0,
            customer: { name: 'Kavindu' },
          },
        ],
      });

      const res = await getAllOrders({ page: 1, limit: 10 });
      expect(res.orders).toHaveLength(1);
      expect(res.orders[0].customer_name).toBe('Kavindu');
    });
  });

  describe('updateOrderStatus', () => {
    it('updates status and tracking number', async () => {
      const mockUpdate = jest.fn();
      Order.findByPk.mockResolvedValue({
        id: 1,
        status: 'processing',
        update: mockUpdate,
      });

      const updated = await updateOrderStatus(1, 'shipped', 'TRK-12345');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'shipped', trackingNumber: 'TRK-12345' })
      );
    });
  });
});
