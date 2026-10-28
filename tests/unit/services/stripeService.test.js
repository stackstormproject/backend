const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockConstructEvent = jest.fn();
const mockRefundCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreate, retrieve: mockRetrieve },
    webhooks: { constructEvent: mockConstructEvent },
    refunds: { create: mockRefundCreate },
  }))
);

jest.mock('../../../src/models', () => ({
  Order: { findByPk: jest.fn() },
  sequelize: { query: jest.fn() },
}));

jest.mock('../../../src/services/reservation.service', () => ({
  confirmReservation: jest.fn(),
}));

const { Order, sequelize } = require('../../../src/models');
const reservationService = require('../../../src/services/reservation.service');
const stripeService = require('../../../src/services/stripe.service');

const REAL_KEY = 'sk_test_51RealLookingKey';

const makeOrder = (overrides = {}) => {
  const order = {
    id: 10,
    customerId: 4,
    guestOrderToken: null,
    status: 'payment_pending',
    totalAmount: '8850.00',
    paymentIntentId: null,
    ...overrides,
  };
  order.update = jest.fn(async (patch) => Object.assign(order, patch));
  return order;
};

describe('stripeService', () => {
  const env = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, NODE_ENV: 'test' };
    delete process.env.STRIPE_SECRET_KEY;
    sequelize.query.mockResolvedValue([{ id: 'res_1' }]);
    reservationService.confirmReservation.mockResolvedValue(true);
  });

  afterAll(() => {
    process.env = env;
  });

  describe('getProvider', () => {
    it('should use the mock provider given no key outside production', () => {
      expect(stripeService.getProvider()).toBe('mock');
    });

    it('should treat a placeholder key as not configured', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
      expect(stripeService.getProvider()).toBe('mock');
    });

    it('should use Stripe given a real key', () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      expect(stripeService.getProvider()).toBe('stripe');
    });

    it('should refuse to mock payments in production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => stripeService.getProvider()).toThrow(/not configured/);
    });
  });

  describe('toMinorUnits', () => {
    it('should convert rupees to integer cents without float drift', () => {
      expect(stripeService.toMinorUnits('8850.10')).toBe(885010);
      expect(stripeService.toMinorUnits(0.1 + 0.2)).toBe(30);
    });
  });

  describe('createPaymentIntent', () => {
    it('should return 404 given the caller does not own the order', async () => {
      Order.findByPk.mockResolvedValue(makeOrder());

      await expect(stripeService.createPaymentIntent(10, { customerId: 5 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should return 409 given the order is already paid', async () => {
      Order.findByPk.mockResolvedValue(makeOrder({ status: 'processing' }));

      await expect(stripeService.createPaymentIntent(10, { customerId: 4 })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('should issue a mock intent and store its id given no Stripe key', async () => {
      const order = makeOrder();
      Order.findByPk.mockResolvedValue(order);

      const result = await stripeService.createPaymentIntent(10, { customerId: 4 });

      expect(result).toMatchObject({ provider: 'mock', amount: 8850, currency: 'LKR' });
      expect(order.paymentIntentId).toBe(result.paymentIntentId);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should create a Stripe intent for the stored total given a real key', async () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      const order = makeOrder();
      Order.findByPk.mockResolvedValue(order);
      mockCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret' });

      const result = await stripeService.createPaymentIntent(10, { customerId: 4 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 885000, currency: 'lkr', metadata: { order_id: '10' } }),
        { idempotencyKey: 'order-10-885000' }
      );
      expect(result).toMatchObject({ provider: 'stripe', clientSecret: 'pi_1_secret' });
      expect(order.paymentIntentId).toBe('pi_1');
    });

    it('should reuse an existing open intent instead of creating another', async () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'pi_9' }));
      mockRetrieve.mockResolvedValue({
        id: 'pi_9',
        status: 'requires_payment_method',
        client_secret: 's',
      });

      await stripeService.createPaymentIntent(10, { customerId: 4 });

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should allow a guest with the matching guest token', async () => {
      Order.findByPk.mockResolvedValue(makeOrder({ customerId: null, guestOrderToken: 'tok' }));

      await expect(
        stripeService.createPaymentIntent(10, { guestToken: 'tok' })
      ).resolves.toMatchObject({ provider: 'mock' });
    });
  });

  describe('confirmOrderPayment', () => {
    it('should reject an intent id that does not belong to the order', async () => {
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'pi_real' }));

      await expect(
        stripeService.confirmOrderPayment(10, { customerId: 4 }, 'pi_forged')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should return 402 given Stripe says the intent has not succeeded', async () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'pi_1' }));
      mockRetrieve.mockResolvedValue({
        status: 'requires_payment_method',
        amount: 885000,
        metadata: { order_id: '10' },
      });

      await expect(
        stripeService.confirmOrderPayment(10, { customerId: 4 }, 'pi_1')
      ).rejects.toMatchObject({ statusCode: 402 });
    });

    it('should return 402 given the paid amount differs from the order total', async () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'pi_1' }));
      mockRetrieve.mockResolvedValue({
        status: 'succeeded',
        amount: 100,
        metadata: { order_id: '10' },
      });

      await expect(
        stripeService.confirmOrderPayment(10, { customerId: 4 }, 'pi_1')
      ).rejects.toMatchObject({ statusCode: 402 });
    });

    it('should mark the order paid and confirm its reservation given a verified intent', async () => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      const order = makeOrder({ paymentIntentId: 'pi_1' });
      Order.findByPk.mockResolvedValue(order);
      mockRetrieve.mockResolvedValue({
        status: 'succeeded',
        amount: 885000,
        metadata: { order_id: '10' },
      });

      const result = await stripeService.confirmOrderPayment(10, { customerId: 4 }, 'pi_1');

      expect(result).toEqual({ orderId: 10, status: 'processing' });
      expect(reservationService.confirmReservation).toHaveBeenCalledWith('res_1');
    });

    it('should be idempotent given the order is already paid', async () => {
      Order.findByPk.mockResolvedValue(makeOrder({ status: 'processing' }));

      await expect(stripeService.confirmOrderPayment(10, { customerId: 4 })).resolves.toEqual({
        orderId: 10,
        status: 'processing',
      });
      expect(reservationService.confirmReservation).not.toHaveBeenCalled();
    });

    it('should still record payment given the reservation had already expired', async () => {
      const order = makeOrder({ paymentIntentId: 'mock_pi_10' });
      Order.findByPk.mockResolvedValue(order);
      reservationService.confirmReservation.mockResolvedValue(false);

      await stripeService.confirmOrderPayment(10, { customerId: 4 }, 'mock_pi_10');

      expect(order.status).toBe('processing');
    });

    it('should reject paying a cancelled order', async () => {
      Order.findByPk.mockResolvedValue(
        makeOrder({ status: 'cancelled', paymentIntentId: 'mock_pi' })
      );

      await expect(
        stripeService.confirmOrderPayment(10, { customerId: 4 }, 'mock_pi')
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('constructWebhookEvent', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
    });

    it('should throw given no signature', () => {
      expect(() => stripeService.constructWebhookEvent(Buffer.from('{}'), null)).toThrow(
        /Signature/
      );
    });

    it('should throw given no payload', () => {
      expect(() => stripeService.constructWebhookEvent(null, 'sig')).toThrow(/payload/);
    });

    it('should return the verified event', () => {
      mockConstructEvent.mockReturnValue({ type: 'x' });

      expect(stripeService.constructWebhookEvent(Buffer.from('{}'), 'sig')).toEqual({ type: 'x' });
    });

    it('should wrap a verification failure as 400', () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('bad sig');
      });

      expect(() => stripeService.constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow(
        /verification failed/
      );
    });
  });

  describe('handleWebhookEvent', () => {
    const succeeded = (amount = 885000) => ({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', amount, metadata: { order_id: '10' } } },
    });

    it('should ignore other event types', async () => {
      await expect(
        stripeService.handleWebhookEvent({ type: 'charge.refunded' })
      ).resolves.toMatchObject({
        processed: false,
      });
    });

    it('should ignore a success without an order id', async () => {
      const result = await stripeService.handleWebhookEvent({
        type: 'payment_intent.succeeded',
        data: { object: { metadata: {} } },
      });

      expect(result.processed).toBe(false);
    });

    it('should ignore an unknown order', async () => {
      Order.findByPk.mockResolvedValue(null);

      expect((await stripeService.handleWebhookEvent(succeeded())).processed).toBe(false);
    });

    it('should not mark paid given an amount mismatch', async () => {
      const order = makeOrder();
      Order.findByPk.mockResolvedValue(order);

      const result = await stripeService.handleWebhookEvent(succeeded(1));

      expect(result.processed).toBe(false);
      expect(order.update).not.toHaveBeenCalled();
    });

    it('should mark the order paid given a matching success', async () => {
      const order = makeOrder();
      Order.findByPk.mockResolvedValue(order);

      const result = await stripeService.handleWebhookEvent(succeeded());

      expect(result).toMatchObject({ processed: true, status: 'processing' });
      expect(order.paymentIntentId).toBe('pi_1');
    });
  });

  describe('refundOrderPayment', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = REAL_KEY;
      mockRefundCreate.mockResolvedValue({ id: 're_1' });
    });

    it('should do nothing for an order that was never paid', async () => {
      await expect(stripeService.refundOrderPayment(makeOrder())).resolves.toEqual({
        refunded: false,
      });
      await expect(
        stripeService.refundOrderPayment(makeOrder({ paymentIntentId: 'pi_1' }), 0)
      ).resolves.toEqual({ refunded: false });
    });

    it('should record a mock refund without calling Stripe', async () => {
      const result = await stripeService.refundOrderPayment(
        makeOrder({ paymentIntentId: 'mock_pi_10' }),
        3000
      );

      expect(result).toMatchObject({ refunded: true, provider: 'mock', amount: 3000 });
      expect(mockRefundCreate).not.toHaveBeenCalled();
    });

    it('should use the caller key so two same-amount item refunds stay separate', async () => {
      const order = makeOrder({ paymentIntentId: 'pi_1' });

      await stripeService.refundOrderPayment(order, 3000, 'return-41');
      await stripeService.refundOrderPayment(order, 3000, 'return-42');
      await stripeService.refundOrderPayment(order);

      expect(mockRefundCreate.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([
        'return-41',
        'return-42',
        'refund-10-885000',
      ]);
      expect(mockRefundCreate.mock.calls[0][0]).toEqual({ payment_intent: 'pi_1', amount: 300000 });
    });
  });
});
