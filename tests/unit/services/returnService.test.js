const ApiError = require('../../../src/utils/ApiError');

jest.mock('../../../src/models', () => {
  return {
    Return: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    },
    Order: {},
    OrderItem: {
      findByPk: jest.fn(),
    },
    ProductVariant: {
      findByPk: jest.fn(),
    },
    Product: {},
  };
});

const { Return, OrderItem, ProductVariant } = require('../../../src/models');
const {
  requestReturn,
  getCustomerReturns,
  getReturnById,
} = require('../../../src/services/return.service');

describe('returnService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestReturn', () => {
    it('throws validation error if reason is missing', async () => {
      await expect(requestReturn({ customerId: 4, orderItemId: 1, reason: '' })).rejects.toThrow(
        ApiError
      );
    });

    it('throws forbidden if order does not belong to customer', async () => {
      OrderItem.findByPk.mockResolvedValue({
        id: 1,
        order: { customerId: 99 },
      });

      await expect(
        requestReturn({ customerId: 4, orderItemId: 1, reason: 'Wrong size' })
      ).rejects.toThrow(ApiError);
    });

    it('creates return request with refund amount calculation', async () => {
      OrderItem.findByPk.mockResolvedValue({
        id: 1,
        orderId: 10,
        subtotal: 4850.0,
        order: { customerId: 4, status: 'delivered', deliveryDate: new Date() },
      });
      Return.findOne.mockResolvedValue(null);
      Return.create.mockResolvedValue({
        id: 77,
        orderId: 10,
        orderItemId: 1,
        type: 'return',
        exchangeVariantId: null,
        reason: 'Too large',
        status: 'requested',
        refundAmount: 4850.0,
        createdAt: new Date(),
      });

      const res = await requestReturn({
        customerId: 4,
        orderItemId: 1,
        type: 'return',
        reason: 'Too large',
      });

      expect(res.id).toBe(77);
      expect(res.refund_amount).toBe(4850.0);
      expect(res.status).toBe('requested');
    });

    it('validates exchange variant existence for exchange type', async () => {
      OrderItem.findByPk.mockResolvedValue({
        id: 1,
        orderId: 10,
        subtotal: 4850.0,
        order: { customerId: 4, status: 'delivered', deliveryDate: new Date() },
      });
      Return.findOne.mockResolvedValue(null);
      ProductVariant.findByPk.mockResolvedValue(null);

      await expect(
        requestReturn({
          customerId: 4,
          orderItemId: 1,
          type: 'exchange',
          exchangeVariantId: 999,
          reason: 'Need size L',
        })
      ).rejects.toThrow(ApiError);
    });
  });

  // Refs #155
  describe('exchange target', () => {
    const itemOfProduct = (productId, variantId) => ({
      id: 1,
      orderId: 10,
      subtotal: 4850.0,
      order: { customerId: 4, status: 'delivered', deliveryDate: new Date() },
      variant: { id: variantId, productId, product: { id: productId, isFinalSale: false } },
    });
    const exchangeFor = (exchangeVariantId) =>
      requestReturn({
        customerId: 4,
        orderItemId: 1,
        type: 'exchange',
        exchangeVariantId,
        reason: 'Need size L',
      });

    beforeEach(() => {
      Return.findOne.mockResolvedValue(null);
      Return.create.mockImplementation(async (data) => ({ id: 7, status: 'requested', ...data }));
    });

    it('should reject an exchange for a different product', async () => {
      OrderItem.findByPk.mockResolvedValue(itemOfProduct(3, 30));
      ProductVariant.findByPk.mockResolvedValue({ id: 90, productId: 9 });

      await expect(exchangeFor(90)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/same product/),
      });
      expect(Return.create).not.toHaveBeenCalled();
    });

    it('should reject an exchange for the same variant', async () => {
      OrderItem.findByPk.mockResolvedValue(itemOfProduct(3, 30));
      ProductVariant.findByPk.mockResolvedValue({ id: 30, productId: 3 });

      await expect(exchangeFor(30)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should accept another size of the same product', async () => {
      OrderItem.findByPk.mockResolvedValue(itemOfProduct(3, 30));
      ProductVariant.findByPk.mockResolvedValue({ id: 31, productId: 3 });

      await exchangeFor(31);

      expect(Return.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'exchange', exchangeVariantId: 31 })
      );
    });
  });

  describe('getCustomerReturns', () => {
    it('returns paginated return requests', async () => {
      Return.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 77,
            orderId: 10,
            orderItemId: 1,
            type: 'return',
            reason: 'Too large',
            status: 'requested',
            refundAmount: 4850.0,
            orderItem: { variant: { sku: 'BATIK-M', product: { name: 'Shirt' } } },
          },
        ],
      });

      const res = await getCustomerReturns(4, { page: 1, limit: 10 });
      expect(res.returns).toHaveLength(1);
      expect(res.returns[0].product_title).toBe('Shirt');
    });
  });

  describe('assertReturnEligible', () => {
    const { assertReturnEligible } = require('../../../src/services/return.service');
    const now = new Date('2026-11-30T00:00:00Z');
    const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

    it('should reject an order that is not delivered', () => {
      expect(() => assertReturnEligible({ status: 'shipped' }, null, now)).toThrow(/delivered/);
    });

    it('should reject a final-sale product', () => {
      expect(() =>
        assertReturnEligible(
          { status: 'delivered', deliveryDate: daysAgo(1) },
          { isFinalSale: true },
          now
        )
      ).toThrow(/Final-sale/);
    });

    it('should accept a delivery exactly 30 days ago', () => {
      expect(() =>
        assertReturnEligible({ status: 'delivered', deliveryDate: daysAgo(30) }, {}, now)
      ).not.toThrow();
    });

    it('should reject a delivery 31 days ago', () => {
      expect(() =>
        assertReturnEligible({ status: 'delivered', deliveryDate: daysAgo(31) }, {}, now)
      ).toThrow(/30-day/);
    });
  });
});
