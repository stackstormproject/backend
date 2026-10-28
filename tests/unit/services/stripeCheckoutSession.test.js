const mockSessionCreate = jest.fn();
const mockSessionRetrieve = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionCreate, retrieve: mockSessionRetrieve } },
  }))
);
jest.mock('../../../src/models', () => ({
  Order: { findByPk: jest.fn() },
  sequelize: { query: jest.fn() },
}));
jest.mock('../../../src/services/reservation.service', () => ({
  confirmReservation: jest.fn().mockResolvedValue(true),
}));

const { Order, sequelize } = require('../../../src/models');
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
