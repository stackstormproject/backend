const mockPaymentIntentsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }))
);

jest.mock('../../../src/models', () => ({
  Order: {
    findByPk: jest.fn(),
    update: jest.fn(),
  },
  Payment: {
    findOrCreate: jest.fn(),
  },
}));

jest.mock('../../../src/services/reservation.service', () => ({
  confirmReservation: jest.fn(),
}));

const { Order, Payment } = require('../../../src/models');
const reservationService = require('../../../src/services/reservation.service');
const stripeService = require('../../../src/services/stripe.service');
const ApiError = require('../../../src/utils/ApiError');

describe('stripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should throw bad request if orderId is missing', async () => {
      await expect(stripeService.createPaymentIntent(null)).rejects.toThrow(ApiError);
    });

    it('should throw not found if order does not exist in database', async () => {
      Order.findByPk.mockResolvedValue(null);
      await expect(stripeService.createPaymentIntent('ord_missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should calculate integer cents, create Stripe intent, and persist Payment record', async () => {
      const mockOrder = {
        id: 101,
        order_number: 'DFC-20261023-1234',
        total_amount: '10450.00',
      };

      Order.findByPk.mockResolvedValue(mockOrder);
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_intent_999',
        client_secret: 'pi_test_intent_999_secret_abc',
        status: 'requires_payment_method',
      });
      Payment.findOrCreate.mockResolvedValue([{}, true]);

      const result = await stripeService.createPaymentIntent(101);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 1045000,
        currency: 'lkr',
        metadata: {
          order_id: '101',
          order_number: 'DFC-20261023-1234',
        },
        payment_method_types: ['card'],
      });

      expect(Payment.findOrCreate).toHaveBeenCalledWith({
        where: { order_id: 101 },
        defaults: expect.objectContaining({
          payment_method: 'stripe',
          payment_intent_id: 'pi_test_intent_999',
          amount: 10450,
          currency: 'LKR',
          status: 'pending',
        }),
      });

      expect(result).toEqual({
        clientSecret: 'pi_test_intent_999_secret_abc',
        paymentIntentId: 'pi_test_intent_999',
        orderId: 101,
        amount: 10450,
        currency: 'LKR',
        status: 'requires_payment_method',
      });
    });
  });

  describe('constructWebhookEvent', () => {
    it('should throw bad request if signature is missing', () => {
      expect(() => stripeService.constructWebhookEvent(Buffer.from('payload'), null)).toThrow(
        ApiError
      );
    });

    it('should throw bad request if payload is missing', () => {
      expect(() => stripeService.constructWebhookEvent(null, 'sig_header')).toThrow(ApiError);
    });

    it('should return parsed event when signature verification succeeds', () => {
      const mockEvent = { id: 'evt_123', type: 'payment_intent.succeeded' };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = stripeService.constructWebhookEvent(Buffer.from('payload'), 'sig_header');
      expect(result).toBe(mockEvent);
    });

    it('should throw bad request if signature verification throws an error', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() =>
        stripeService.constructWebhookEvent(Buffer.from('payload'), 'sig_header')
      ).toThrow(ApiError);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should finalize order and confirm reservation given payment_intent.succeeded', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_success',
            metadata: {
              order_id: '500',
            },
          },
        },
      };

      Order.update.mockResolvedValue([1]);
      reservationService.confirmReservation.mockResolvedValue(true);

      const result = await stripeService.handleWebhookEvent(event);

      expect(Order.update).toHaveBeenCalledWith(
        { status: 'processing', paymentIntentId: 'pi_test_success' },
        { where: { id: '500' } }
      );
      expect(reservationService.confirmReservation).toHaveBeenCalledWith('500');
      expect(result).toEqual({
        success: true,
        order_id: '500',
        status: 'paid',
      });
    });

    it('should handle reservation confirmation error gracefully without failing webhook', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_success',
            metadata: {
              order_id: '501',
            },
          },
        },
      };

      Order.update.mockResolvedValue([1]);
      reservationService.confirmReservation.mockRejectedValue(new Error('Already confirmed'));

      const result = await stripeService.handleWebhookEvent(event);

      expect(result).toEqual({
        success: true,
        order_id: '501',
        status: 'paid',
      });
    });

    it('should return un-processed success given payment_intent.succeeded without order_id', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_no_meta',
            metadata: {},
          },
        },
      };

      const result = await stripeService.handleWebhookEvent(event);
      expect(result).toEqual({ success: true, processed: false });
    });

    it('should ignore non-payment_intent.succeeded events', async () => {
      const event = {
        type: 'customer.created',
        data: { object: {} },
      };

      const result = await stripeService.handleWebhookEvent(event);
      expect(result).toEqual({
        success: true,
        processed: false,
        ignoredEvent: 'customer.created',
      });
    });
  });
});
