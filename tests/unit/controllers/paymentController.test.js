jest.mock('../../../src/services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  constructWebhookEvent: jest.fn(),
  handleWebhookEvent: jest.fn(),
}));

const stripeService = require('../../../src/services/stripe.service');
const {
  createPaymentIntent,
  handleWebhook,
} = require('../../../src/controllers/payment.controller');
const ApiError = require('../../../src/utils/ApiError');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('payment controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should call next with badRequest if order_id is missing', async () => {
      const req = { body: {} };
      const res = mockRes();
      const next = jest.fn();

      await createPaymentIntent(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should create payment intent and return 200 with result', async () => {
      const mockResult = { clientSecret: 'pi_secret_123', paymentIntentId: 'pi_123' };
      stripeService.createPaymentIntent.mockResolvedValue(mockResult);

      const req = { body: { order_id: 'ord_123' } };
      const res = mockRes();
      const next = jest.fn();

      await createPaymentIntent(req, res, next);

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith('ord_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult,
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should support orderId camelCase alias', async () => {
      const mockResult = { clientSecret: 'pi_secret_456' };
      stripeService.createPaymentIntent.mockResolvedValue(mockResult);

      const req = { body: { orderId: 'ord_456' } };
      const res = mockRes();
      const next = jest.fn();

      await createPaymentIntent(req, res, next);

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith('ord_456');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should pass service errors to next', async () => {
      const err = new Error('Database down');
      stripeService.createPaymentIntent.mockRejectedValue(err);

      const req = { body: { order_id: 'ord_fail' } };
      const res = mockRes();
      const next = jest.fn();

      await createPaymentIntent(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('handleWebhook', () => {
    it('should pass error to next if stripe-signature header is missing', async () => {
      const req = { headers: {}, body: {} };
      const res = mockRes();
      const next = jest.fn();

      await handleWebhook(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should verify signature and process webhook successfully', async () => {
      const mockEvent = { id: 'evt_1', type: 'payment_intent.succeeded' };
      const mockResult = { success: true, order_id: 'ord_1', status: 'paid' };

      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeService.handleWebhookEvent.mockResolvedValue(mockResult);

      const req = {
        headers: { 'stripe-signature': 'sig_test_123' },
        rawBody: Buffer.from(JSON.stringify({ some: 'data' })),
      };
      const res = mockRes();
      const next = jest.fn();

      await handleWebhook(req, res, next);

      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(
        req.rawBody,
        'sig_test_123'
      );
      expect(stripeService.handleWebhookEvent).toHaveBeenCalledWith(mockEvent);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          received: true,
          success: true,
          status: 'paid',
        })
      );
    });

    it('should convert object payload to Buffer if rawBody is not present', async () => {
      const mockEvent = { id: 'evt_2', type: 'payment_intent.succeeded' };
      stripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      stripeService.handleWebhookEvent.mockResolvedValue({ success: true });

      const req = {
        headers: { 'stripe-signature': 'sig_test_456' },
        body: { id: 'test' },
      };
      const res = mockRes();
      const next = jest.fn();

      await handleWebhook(req, res, next);

      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        'sig_test_456'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should forward signature verification error to next', async () => {
      const err = new Error('Invalid signature');
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw err;
      });

      const req = {
        headers: { 'stripe-signature': 'bad_sig' },
        body: {},
      };
      const res = mockRes();
      const next = jest.fn();

      await handleWebhook(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
