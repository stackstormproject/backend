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
    it('throws badRequest when orderId is missing', async () => {
      await expect(getOrderById(null)).rejects.toMatchObject({ statusCode: 400 });
      await expect(getOrderById('')).rejects.toMatchObject({ statusCode: 400 });
    });

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

    it('throws forbidden if guest token does not match', async () => {
      Order.findByPk.mockResolvedValue({
        id: 15,
        customerId: null,
        guestOrderToken: 'valid_token_123',
        status: 'processing',
      });

      await expect(getOrderById(15, null, 'wrong_token')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('allows guest to view order when guest token matches', async () => {
      Order.findByPk.mockResolvedValue({
        id: 15,
        customerId: null,
        guestOrderToken: 'valid_token_123',
        status: 'processing',
        billingAddress: { line1: '45 Lake Rd', city: 'Matara' },
        shippingAddress: 'Invalid JSON string should be returned as raw',
        items: [],
      });

      const res = await getOrderById(15, null, 'valid_token_123');
      expect(res.id).toBe(15);
      expect(res.is_guest).toBe(true);
      expect(res.shipping_address).toBe('Invalid JSON string should be returned as raw');
      expect(res.billing_address.city).toBe('Matara');
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

    it('returns paginated orders for customer with fallback items formatting', async () => {
      Order.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 10,
            customerId: 4,
            status: 'processing',
            totalAmount: 4850.0,
            items: [
              {
                id: 101,
                productVariantId: 22,
                quantity: null,
                unitPrice: '2500',
                subtotal: '2500',
                variant: null,
              },
            ],
          },
        ],
      });

      const result = await getCustomerOrders(4, { page: 1, limit: 10 });
      expect(result.pagination.total).toBe(1);
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].id).toBe(10);
      expect(result.orders[0].items[0].product_title).toBe('Garment Item');
      expect(result.orders[0].items[0].sku).toBe('');
      expect(result.orders[0].items_count).toBe(1);
    });
  });

  describe('getOrderTracking', () => {
    it('builds milestone tracking progression for shipped order', async () => {
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

    it('builds milestone tracking for cancelled order including cancellation milestone', async () => {
      Order.findByPk.mockResolvedValue({
        id: 11,
        customerId: 4,
        status: 'cancelled',
        orderDate: new Date('2026-10-21'),
        items: [],
      });

      const tracking = await getOrderTracking(11, 4);
      expect(tracking.current_status).toBe('cancelled');
      expect(tracking.milestones).toHaveLength(5);
      expect(tracking.milestones[0].status).toBe('completed');
      expect(tracking.milestones[1].status).toBe('pending');
      expect(tracking.milestones[4].key).toBe('cancelled');
      expect(tracking.milestones[4].status).toBe('completed');
    });

    it('handles unrecognized order status gracefully in milestones', async () => {
      Order.findByPk.mockResolvedValue({
        id: 12,
        customerId: 4,
        status: 'unknown_custom_status',
        orderDate: new Date('2026-10-21'),
        items: [],
      });

      const tracking = await getOrderTracking(12, 4);
      expect(tracking.milestones[0].status).toBe('pending');
      expect(tracking.milestones[1].status).toBe('pending');
    });
  });

  describe('finalizeOrder', () => {
    it('throws badRequest if orderId is missing', async () => {
      await expect(finalizeOrder(null)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws notFound if order does not exist', async () => {
      Order.findByPk.mockResolvedValue(null);
      await expect(finalizeOrder(999)).rejects.toMatchObject({ statusCode: 404 });
    });

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

    it('supports fallback paymentDetails.id or generates fallback payment intent id', async () => {
      const mockUpdate = jest.fn();
      Order.findByPk.mockResolvedValue({
        id: 10,
        status: 'payment_pending',
        update: mockUpdate,
      });

      await finalizeOrder(10, { id: 'pi_via_id' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentIntentId: 'pi_via_id' })
      );

      await finalizeOrder(10, {});
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ paymentIntentId: expect.stringMatching(/^pi_\d+$/) })
      );
    });
  });
});
