const ApiError = require('../../../src/utils/ApiError');

jest.mock('../../../src/models', () => {
  return {
    Order: {
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    OrderItem: {},
    ProductVariant: {},
    Product: {},
    Customer: {},
    sequelize: {
      transaction: jest.fn(async (cb) => cb({})),
    },
  };
});

const { Order } = require('../../../src/models');
const {
  getOrderById,
  getCustomerOrders,
  getOrderTracking,
  finalizeOrder,
  generateInvoiceNumber,
} = require('../../../src/services/order.service');

describe('orderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateInvoiceNumber', () => {
    it('generates formatted invoice number DFC-YYYY-XXXX', () => {
      const num = generateInvoiceNumber({ id: 42, orderDate: new Date('2026-10-15') });
      expect(num).toBe('DFC-2026-0042');
    });
  });

  describe('getOrderById', () => {
    it('throws not found when order does not exist', async () => {
      Order.findByPk.mockResolvedValue(null);
      await expect(getOrderById(999)).rejects.toThrow(ApiError);
    });

    it('throws forbidden if order belongs to another customer', async () => {
      Order.findByPk.mockResolvedValue({
        id: 10,
        customerId: 4,
        status: 'processing',
      });

      await expect(getOrderById(10, 99)).rejects.toThrow(ApiError);
    });

    it('returns formatted order for owner', async () => {
      Order.findByPk.mockResolvedValue({
        id: 10,
        customerId: 4,
        status: 'delivered',
        orderDate: new Date('2026-10-20'),
        shippingAddress: JSON.stringify({ line1: '12 Beach Rd', city: 'Dickwella' }),
        items: [
          {
            id: 1,
            productVariantId: 2,
            quantity: 1,
            unitPrice: 4850.0,
            subtotal: 4850.0,
            variant: {
              sku: 'BATIK-BLU-M',
              size: 'M',
              product: { title: 'Batik Shirt' },
            },
          },
        ],
        customer: { id: 4, name: 'Kavindu', email: 'bgkpabasara@gmail.com' },
      });

      const result = await getOrderById(10, 4);
      expect(result.id).toBe(10);
      expect(result.status).toBe('delivered');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].product_title).toBe('Batik Shirt');
      expect(result.shipping_address.city).toBe('Dickwella');
    });
  });

  describe('getCustomerOrders', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(getCustomerOrders(null)).rejects.toThrow(ApiError);
    });

    it('returns paginated orders for customer', async () => {
      Order.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 10,
            customerId: 4,
            status: 'processing',
            totalAmount: 4850.0,
            items: [],
          },
        ],
      });

      const result = await getCustomerOrders(4, { page: 1, limit: 10 });
      expect(result.pagination.total).toBe(1);
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].id).toBe(10);
    });
  });

  describe('getOrderTracking', () => {
    it('builds milestone tracking progression', async () => {
      Order.findByPk.mockResolvedValue({
        id: 10,
        customerId: 4,
        status: 'shipped',
        orderDate: new Date('2026-10-20'),
        items: [],
      });

      const tracking = await getOrderTracking(10, 4);
      expect(tracking.order_id).toBe(10);
      expect(tracking.current_status).toBe('shipped');
      expect(tracking.milestones).toHaveLength(4);
      expect(tracking.milestones[0].status).toBe('completed'); // Placed
      expect(tracking.milestones[1].status).toBe('completed'); // Processing
      expect(tracking.milestones[2].status).toBe('current'); // Shipped
      expect(tracking.milestones[3].status).toBe('pending'); // Delivered
    });
  });

  describe('finalizeOrder', () => {
    it('transitions order to processing and updates paymentIntentId', async () => {
      const mockUpdate = jest.fn();
      Order.findByPk.mockResolvedValue({
        id: 10,
        status: 'payment_pending',
        update: mockUpdate,
      });

      const res = await finalizeOrder(10, { payment_intent_id: 'pi_test_999' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing', paymentIntentId: 'pi_test_999' })
      );
      expect(res.success).toBe(true);
    });
  });
});
