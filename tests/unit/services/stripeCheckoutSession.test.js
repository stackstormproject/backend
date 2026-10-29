const mockSessionCreate = jest.fn();
const mockSessionRetrieve = jest.fn();
const mockCustomerCreate = jest.fn();
const mockDetach = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionCreate, retrieve: mockSessionRetrieve } },
    customers: { create: mockCustomerCreate },
    paymentMethods: { detach: mockDetach },
  }))
);
jest.mock('../../../src/models', () => ({
  Order: { findByPk: jest.fn() },
  Customer: { findByPk: jest.fn() },
  sequelize: { query: jest.fn() },
}));
jest.mock('../../../src/services/paymentMethod.service', () => ({
  saveFromStripe: jest.fn(),
  saveTestCard: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../../src/services/reservation.service', () => ({
  confirmReservation: jest.fn().mockResolvedValue(true),
}));

const { Order, Customer, sequelize } = require('../../../src/models');
const paymentMethodService = require('../../../src/services/paymentMethod.service');
const logger = require('../../../src/config/logger');
const stripeService = require('../../../src/services/stripe.service');

// Refs #180: hosted payment page (Stripe Checkout) and its server-side verification.
const owner = { customerId: 4 };
const makeOrder = (overrides = {}) => {
  const order = {
    id: 10,
    customerId: 4,
    status: 'payment_pending',
    totalAmount: '8850.00',
    paymentIntentId: null,
    guestEmail: null,
    ...overrides,
  };
  order.update = jest.fn(async (patch) => Object.assign(order, patch));
  return order;
};

describe('stripeService hosted payment page', () => {
  const env = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_51RealLookingKey' };
    delete process.env.FRONTEND_CUSTOMER_URL;
    process.env.FRONTEND_URL = 'https://shop.example.lk/';
    sequelize.query.mockResolvedValue([{ id: 'res_1' }]);
  });

  afterAll(() => {
    process.env = env;
  });

  it('should create a Stripe Checkout session for the stored total and return its URL', async () => {
    const order = makeOrder({ guestEmail: 'g@example.lk', customerId: null, guestOrderToken: 't' });
    Order.findByPk.mockResolvedValue(order);
    mockSessionCreate.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
    });

    const result = await stripeService.createCheckoutSession(10, { guestToken: 't' });

    expect(result).toEqual({
      provider: 'stripe',
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
      amount: 8850,
    });
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.line_items[0].price_data).toMatchObject({ currency: 'lkr', unit_amount: 885000 });
    expect(args.customer_email).toBe('g@example.lk');
    expect(args.success_url).toBe(
      'https://shop.example.lk/checkout/complete?order=10&session_id={CHECKOUT_SESSION_ID}'
    );
    expect(args.cancel_url).toBe('https://shop.example.lk/checkout/complete?order=10&cancelled=1');
    expect(order.paymentIntentId).toBe('cs_test_1');
  });

  it('should refuse an order that is not awaiting payment', async () => {
    Order.findByPk.mockResolvedValue(makeOrder({ status: 'processing' }));

    await expect(stripeService.createCheckoutSession(10, owner)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('should mark the order paid only for a paid session of the right amount and order', async () => {
    const order = makeOrder({ paymentIntentId: 'cs_test_1' });
    Order.findByPk.mockResolvedValue(order);
    mockSessionRetrieve.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 885000,
      metadata: { order_id: '10' },
      payment_intent: 'pi_1',
    });

    const result = await stripeService.confirmCheckoutSession(10, owner, 'cs_test_1');

    expect(result).toEqual({ orderId: 10, status: 'processing' });
    expect(order.paymentIntentId).toBe('pi_1');
  });

  it.each([
    [{ payment_status: 'unpaid', amount_total: 885000, metadata: { order_id: '10' } }],
    [{ payment_status: 'paid', amount_total: 100, metadata: { order_id: '10' } }],
    [{ payment_status: 'paid', amount_total: 885000, metadata: { order_id: '11' } }],
  ])('should refuse an unpaid or mismatched session %#', async (session) => {
    Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'cs_test_1' }));
    mockSessionRetrieve.mockResolvedValue(session);

    await expect(
      stripeService.confirmCheckoutSession(10, owner, 'cs_test_1')
    ).rejects.toMatchObject({ statusCode: 402 });
  });

  it('should keep the session id when Stripe returns the payment intent as an object or not at all', async () => {
    const order = makeOrder({ paymentIntentId: 'cs_test_2' });
    Order.findByPk.mockResolvedValue(order);
    mockSessionRetrieve.mockResolvedValueOnce({
      payment_status: 'paid',
      amount_total: 885000,
      metadata: { order_id: '10' },
      payment_intent: { id: 'pi_obj' },
    });

    await stripeService.confirmCheckoutSession(10, owner, 'cs_test_2');
    expect(order.paymentIntentId).toBe('pi_obj');

    const other = makeOrder({ paymentIntentId: 'cs_test_3' });
    Order.findByPk.mockResolvedValue(other);
    mockSessionRetrieve.mockResolvedValueOnce({
      payment_status: 'paid',
      amount_total: 885000,
      metadata: { order_id: '10' },
    });
    await stripeService.confirmCheckoutSession(10, owner, 'cs_test_3');
    expect(other.paymentIntentId).toBe('cs_test_3');
  });

  it('should not accept a test-gateway session once Stripe is configured', async () => {
    Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'mock_cs_10_1' }));

    await expect(
      stripeService.confirmCheckoutSession(10, owner, 'mock_cs_10_1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should return an already paid order unchanged', async () => {
    Order.findByPk.mockResolvedValue(makeOrder({ status: 'processing' }));

    await expect(stripeService.confirmCheckoutSession(10, owner, 'x')).resolves.toEqual({
      orderId: 10,
      status: 'processing',
    });
  });

  it('should use the storefront default URL for the test gateway', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.FRONTEND_URL;
    Order.findByPk.mockResolvedValue(makeOrder());

    const result = await stripeService.createCheckoutSession(10, owner);

    expect(result.provider).toBe('mock');
    expect(result.url).toMatch(
      /^http:\/\/localhost:5173\/checkout\/test-gateway\?order=10&session_id=mock_cs_10_\d+$/
    );
  });

  describe('saved cards (#190)', () => {
    const paidSession = (paymentMethod) => ({
      payment_status: 'paid',
      amount_total: 885000,
      metadata: { order_id: '10' },
      payment_intent: { id: 'pi_5', payment_method: paymentMethod },
    });

    it('should create the Stripe customer once and let Checkout offer to save the card', async () => {
      const customer = { id: 4, email: 'a@x.lk', name: 'A', stripeCustomerId: null };
      customer.update = jest.fn(async (patch) => Object.assign(customer, patch));
      Customer.findByPk.mockResolvedValue(customer);
      mockCustomerCreate.mockResolvedValue({ id: 'cus_1' });
      mockSessionCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/1' });
      Order.findByPk.mockResolvedValue(makeOrder());

      await stripeService.createCheckoutSession(10, owner);
      Order.findByPk.mockResolvedValue(makeOrder());
      await stripeService.createCheckoutSession(10, owner);

      expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
      expect(mockCustomerCreate).toHaveBeenCalledWith({
        email: 'a@x.lk',
        name: 'A',
        metadata: { customer_id: '4' },
      });
      const args = mockSessionCreate.mock.calls[1][0];
      expect(args).toMatchObject({
        customer: 'cus_1',
        saved_payment_method_options: { payment_method_save: 'enabled' },
      });
      expect(args.customer_email).toBeUndefined();
    });

    it('should fall back to the email when the customer record is gone', async () => {
      Customer.findByPk.mockResolvedValue(null);
      mockSessionCreate.mockResolvedValue({ id: 'cs_1', url: 'u' });
      Order.findByPk.mockResolvedValue(makeOrder({ guestEmail: null }));

      await stripeService.createCheckoutSession(10, owner);

      expect(mockSessionCreate.mock.calls[0][0].customer).toBeUndefined();
    });

    it('should save the card only when the shopper ticked save on Stripe', async () => {
      const kept = { id: 'pm_1', customer: 'cus_1', allow_redisplay: 'always', card: {} };
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'cs_1' }));
      mockSessionRetrieve.mockResolvedValue(paidSession(kept));
      await stripeService.confirmCheckoutSession(10, owner, 'cs_1');
      expect(mockSessionRetrieve).toHaveBeenCalledWith('cs_1', {
        expand: ['payment_intent.payment_method'],
      });
      expect(paymentMethodService.saveFromStripe).toHaveBeenCalledWith(4, kept);

      paymentMethodService.saveFromStripe.mockClear();
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'cs_1' }));
      mockSessionRetrieve.mockResolvedValue(
        paidSession({ id: 'pm_2', customer: 'cus_1', allow_redisplay: 'limited' })
      );
      await stripeService.confirmCheckoutSession(10, owner, 'cs_1');
      expect(paymentMethodService.saveFromStripe).not.toHaveBeenCalled();
    });

    it('should keep the payment when saving the card fails', async () => {
      paymentMethodService.saveFromStripe.mockRejectedValue(new Error('db down'));
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'cs_1' }));
      mockSessionRetrieve.mockResolvedValue(
        paidSession({ id: 'pm_1', customer: 'cus_1', allow_redisplay: 'always' })
      );

      await expect(stripeService.confirmCheckoutSession(10, owner, 'cs_1')).resolves.toEqual({
        orderId: 10,
        status: 'processing',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Could not save the card after payment',
        expect.anything()
      );
    });

    it('should save the test card from the test gateway when asked', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'mock_cs_10_1' }));
      await stripeService.confirmCheckoutSession(10, owner, 'mock_cs_10_1', { saveCard: true });
      expect(paymentMethodService.saveTestCard).toHaveBeenCalledWith(4);

      paymentMethodService.saveTestCard.mockClear();
      Order.findByPk.mockResolvedValue(makeOrder({ paymentIntentId: 'mock_cs_10_1' }));
      await stripeService.confirmCheckoutSession(10, owner, 'mock_cs_10_1');
      expect(paymentMethodService.saveTestCard).not.toHaveBeenCalled();
    });

    it('should detach a card at Stripe only when Stripe is in use', async () => {
      await stripeService.detachPaymentMethod('pm_1');
      expect(mockDetach).toHaveBeenCalledWith('pm_1');

      mockDetach.mockClear();
      delete process.env.STRIPE_SECRET_KEY;
      await stripeService.detachPaymentMethod('pm_1');
      expect(mockDetach).not.toHaveBeenCalled();
    });
  });

  describe('webhook checkout.session.completed', () => {
    const event = (object) => ({ type: 'checkout.session.completed', data: { object } });

    it('should pay the order from a completed session', async () => {
      const order = makeOrder();
      Order.findByPk.mockResolvedValue(order);

      const result = await stripeService.handleWebhookEvent(
        event({
          metadata: { order_id: '10' },
          payment_status: 'paid',
          amount_total: 885000,
          payment_intent: 'pi_9',
        })
      );

      expect(result).toMatchObject({ processed: true, status: 'processing' });
      expect(order.paymentIntentId).toBe('pi_9');
    });

    it('should ignore unpaid, unknown or mismatched sessions', async () => {
      Order.findByPk.mockResolvedValueOnce(null);
      expect(
        (await stripeService.handleWebhookEvent(event({ metadata: { order_id: '99' } }))).processed
      ).toBe(false);
      expect((await stripeService.handleWebhookEvent(event({ metadata: {} }))).processed).toBe(
        false
      );
      Order.findByPk.mockResolvedValue(makeOrder());
      expect(
        (
          await stripeService.handleWebhookEvent(
            event({ metadata: { order_id: '10' }, payment_status: 'unpaid' })
          )
        ).processed
      ).toBe(false);
      expect(
        (
          await stripeService.handleWebhookEvent(
            event({ metadata: { order_id: '10' }, payment_status: 'paid', amount_total: 1 })
          )
        ).processed
      ).toBe(false);
    });
  });
});
