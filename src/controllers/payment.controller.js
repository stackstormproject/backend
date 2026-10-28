// ==============================================================================
// Payment Controller - PaymentIntent creation, payment confirmation and webhooks
// ==============================================================================

const stripeService = require('../services/stripe.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/** Who is asking: a logged-in customer, or a guest holding the order's guest token. */
const callerOf = (req) => ({
  customerId: req.user ? req.user.userId || req.user.id : null,
  guestToken: req.get('X-Guest-Token') || req.body?.guest_token || null,
});

/** POST /payments/create-intent { order_id } -> { clientSecret, provider, amount } */
const createPaymentIntent = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) {
      throw ApiError.badRequest('order_id is required in request body');
    }
    const result = await stripeService.createPaymentIntent(orderId, callerOf(req));
    return successResponse(res, result, 'Payment intent created successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/** POST /payments/confirm { order_id, payment_intent_id } - server-verified payment success */
const confirmPayment = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) {
      throw ApiError.badRequest('order_id is required in request body');
    }
    const paymentIntentId = req.body.payment_intent_id || req.body.paymentIntentId || null;
    const result = await stripeService.confirmOrderPayment(orderId, callerOf(req), paymentIntentId);
    return successResponse(res, result, 'Payment confirmed', 200);
  } catch (error) {
    return next(error);
  }
};

/** POST /payments/checkout-session { order_id } -> { provider, sessionId, url } (#180) */
const createCheckoutSession = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) throw ApiError.badRequest('order_id is required in request body');
    const result = await stripeService.createCheckoutSession(orderId, callerOf(req));
    return successResponse(res, result, 'Payment page ready', 200);
  } catch (error) {
    return next(error);
  }
};

/** POST /payments/confirm-session { order_id, session_id } - verified on the server (#180) */
const confirmCheckoutSession = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) throw ApiError.badRequest('order_id is required in request body');
    const result = await stripeService.confirmCheckoutSession(
      orderId,
      callerOf(req),
      req.body.session_id || req.body.sessionId || null
    );
    return successResponse(res, result, 'Payment confirmed', 200);
  } catch (error) {
    return next(error);
  }
};

/** POST /payments/webhook - Stripe calls this; req.body is the raw Buffer (see app.js). */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      throw ApiError.badRequest('Missing stripe-signature header');
    }
    const event = stripeService.constructWebhookEvent(req.body, signature);
    const result = await stripeService.handleWebhookEvent(event);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  callerOf,
  createPaymentIntent,
  confirmPayment,
  createCheckoutSession,
  confirmCheckoutSession,
  handleWebhook,
};
