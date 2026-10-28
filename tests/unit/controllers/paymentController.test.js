jest.mock('../../../src/services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  confirmOrderPayment: jest.fn(),
  constructWebhookEvent: jest.fn(),
  handleWebhookEvent: jest.fn(),
}));

const stripeService = require('../../../src/services/stripe.service');
const {
  callerOf,
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
} = require('../../../src/controllers/payment.controller');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = ({ body = {}, headers = {}, user = null } = {}) => ({
  body,
  user,
  headers,
  get: (name) => headers[name.toLowerCase()],
});

describe('payment controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callerOf', () => {
    it('should read the customer id from the token and the guest token from the header', () => {
      const caller = callerOf(
        mockReq({ user: { userId: 4 }, headers: { 'x-guest-token': 'tok' } })
      );

      expect(caller).toEqual({ customerId: 4, guestToken: 'tok' });
    });

    it('should fall back to a guest token in the body', () => {
      expect(callerOf(mockReq({ body: { guest_token: 'b' } }))).toEqual({
        customerId: null,
        guestToken: 'b',
      });
    });
  });

  describe('createPaymentIntent', () => {
    it('should call next with 400 given no order id', async () => {
      const next = jest.fn();

      await createPaymentIntent(mockReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should pass the caller identity to the service and return 200', async () => {
      stripeService.createPaymentIntent.mockResolvedValue({ clientSecret: 's' });
      const res = mockRes();

      await createPaymentIntent(
        mockReq({ body: { orderId: 10 }, user: { userId: 4 } }),
        res,
        jest.fn()
      );

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(10, {
        customerId: 4,
        guestToken: null,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should forward service errors', async () => {
      const err = new Error('boom');
      stripeService.createPaymentIntent.mockRejectedValue(err);
      const next = jest.fn();

      await createPaymentIntent(mockReq({ body: { order_id: 1 } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('confirmPayment', () => {
    it('should call next with 400 given no order id', async () => {
      const next = jest.fn();

      await confirmPayment(mockReq(), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should confirm with the supplied intent id', async () => {
      stripeService.confirmOrderPayment.mockResolvedValue({ orderId: 10, status: 'processing' });
      const res = mockRes();

      await confirmPayment(
        mockReq({ body: { order_id: 10, payment_intent_id: 'pi_1' }, user: { userId: 4 } }),
        res,
        jest.fn()
      );

      expect(stripeService.confirmOrderPayment).toHaveBeenCalledWith(
        10,
        { customerId: 4, guestToken: null },
        'pi_1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should forward service errors', async () => {
      const err = new Error('402');
      stripeService.confirmOrderPayment.mockRejectedValue(err);
      const next = jest.fn();

      await confirmPayment(mockReq({ body: { order_id: 1 } }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('handleWebhook', () => {
    it('should call next with 400 given no signature header', async () => {
      const next = jest.fn();

      await handleWebhook(mockReq({ body: Buffer.from('{}') }), mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should verify the raw body and acknowledge the event', async () => {
      const raw = Buffer.from('{"id":"evt"}');
      stripeService.constructWebhookEvent.mockReturnValue({ type: 'payment_intent.succeeded' });
      stripeService.handleWebhookEvent.mockResolvedValue({ processed: true });
      const res = mockRes();
      const req = mockReq({ body: raw });
      req.headers['stripe-signature'] = 'sig';

      await handleWebhook(req, res, jest.fn());

      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(raw, 'sig');
      expect(res.json).toHaveBeenCalledWith({ received: true, processed: true });
    });

    it('should forward verification errors', async () => {
      const err = new Error('bad sig');
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw err;
      });
      const next = jest.fn();
      const req = mockReq({ body: Buffer.from('{}') });
      req.headers['stripe-signature'] = 'sig';

      await handleWebhook(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
