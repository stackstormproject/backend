// ==============================================================================
// Payment Controller - Intent Generation & Webhook Endpoint
// Why this file matters: Serves client payment initiation requests and hosts the
// public webhook listener for asynchronous banking notifications.
// ==============================================================================

const stripeService = require('../services/stripe.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Creates Stripe PaymentIntent for order.
 * Client sends { order_id: "..." } and receives { clientSecret: "..." }.
 */
const createPaymentIntent = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) {
      throw ApiError.badRequest('order_id is required in request body');
    }

    const result = await stripeService.createPaymentIntent(orderId);
    return successResponse(res, result, 'Payment intent created successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Handles incoming Stripe webhooks with cryptographic signature verification.
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      throw ApiError.badRequest('Missing stripe-signature header');
    }

    // Extract the raw binary body captured by our express.raw middleware in app.js
    let rawPayload = req.rawBody || req.body;
    if (typeof rawPayload === 'object' && !Buffer.isBuffer(rawPayload)) {
      rawPayload = Buffer.from(JSON.stringify(rawPayload));
    }

    const event = stripeService.constructWebhookEvent(rawPayload, signature);
    const result = await stripeService.handleWebhookEvent(event);

    // Return HTTP 200 to Stripe immediately so Stripe stops retrying the webhook
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPaymentIntent,
  handleWebhook,
};
