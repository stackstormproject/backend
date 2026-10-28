// ==============================================================================
// Payment Service - Stripe PaymentIntents, server-side verification and webhooks
// Why this file matters: an order only becomes "paid" after the server itself has
// confirmed the PaymentIntent with Stripe. The browser is never trusted to say so.
// ==============================================================================

const Stripe = require('stripe');
const { QueryTypes } = require('sequelize');
const { Order, sequelize } = require('../models');
const reservationService = require('./reservation.service');
const { canReadOrder } = require('./order.service');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const CURRENCY = 'lkr';
const PAYABLE_STATUS = 'payment_pending';
const PAID_STATUS = 'processing';
const MOCK_PROVIDER = 'mock';
const STRIPE_PROVIDER = 'stripe';
const PLACEHOLDER_KEY = /^sk_(test|live)_(x+|mock.*)$/i;

/**
 * Stripe when a real secret key is configured. Outside production a missing or placeholder key
 * selects the mock provider so local development and CI work without a Stripe account.
 * Production without a key is a configuration error, never a silent mock.
 */
const getProvider = () => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key && !PLACEHOLDER_KEY.test(key)) return STRIPE_PROVIDER;
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(503, 'Payments are not configured', undefined, 'PAYMENTS_UNAVAILABLE');
  }
  return MOCK_PROVIDER;
};

let stripeClient;
const getStripe = () => {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return stripeClient;
};

/** Integer minor units, avoiding floating-point drift (LKR 8,850.00 -> 885000). */
const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

/** Loads an order the caller may act on; anything else is "not found" (no id probing). */
const loadOwnedOrder = async (orderId, { customerId = null, guestToken = null } = {}) => {
  if (!orderId) throw ApiError.badRequest('order_id is required');
  const order = await Order.findByPk(orderId);
  if (!order || !canReadOrder(order, customerId, guestToken)) {
    throw ApiError.notFound(`Order with ID '${orderId}' not found`);
  }
  return order;
};

/**
 * Creates (or reuses) the PaymentIntent for a payment_pending order.
 * The amount always comes from the stored order total, never from the client.
 */
const createPaymentIntent = async (orderId, caller = {}) => {
  const order = await loadOwnedOrder(orderId, caller);
  if (order.status !== PAYABLE_STATUS) {
    throw ApiError.conflict(`Order ${order.id} is not awaiting payment (status: ${order.status})`);
  }

  const amount = Number(order.totalAmount);
  const provider = getProvider();

  if (provider === MOCK_PROVIDER) {
    const paymentIntentId = order.paymentIntentId || `mock_pi_${order.id}_${Date.now()}`;
    if (!order.paymentIntentId) await order.update({ paymentIntentId });
    return {
      provider,
      clientSecret: `${paymentIntentId}_secret_mock`,
      paymentIntentId,
      orderId: order.id,
      amount,
      currency: 'LKR',
    };
  }

  const stripe = getStripe();
  let intent = order.paymentIntentId
    ? await stripe.paymentIntents.retrieve(order.paymentIntentId)
    : null;
  if (!intent || intent.status === 'canceled') {
    intent = await stripe.paymentIntents.create(
      {
        amount: toMinorUnits(amount),
        currency: CURRENCY,
        metadata: { order_id: String(order.id) },
        payment_method_types: ['card'],
      },
      { idempotencyKey: `order-${order.id}-${toMinorUnits(amount)}` }
    );
    await order.update({ paymentIntentId: intent.id });
  }

  return {
    provider,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    orderId: order.id,
    amount,
    currency: 'LKR',
  };
};

/** Finds the stock hold that checkout linked to this order (see checkout.service). */
const findOrderReservationId = async (orderId) => {
  const [row] = await sequelize.query(
    `SELECT id FROM stock_reservations WHERE order_id = :orderId
      ORDER BY created_at DESC LIMIT 1`,
    { replacements: { orderId }, type: QueryTypes.SELECT }
  );
  return row ? row.id : null;
};

/**
 * Marks a verified order as paid and turns its 15-minute hold into a permanent deduction.
 * Idempotent: a webhook and the browser may both report the same success.
 */
const markOrderPaid = async (order, paymentIntentId) => {
  if (order.status === PAID_STATUS) return { orderId: order.id, status: order.status };
  if (order.status !== PAYABLE_STATUS) {
    throw ApiError.conflict(`Order ${order.id} cannot be paid (status: ${order.status})`);
  }

  const reservationId = await findOrderReservationId(order.id);
  if (reservationId) {
    // false means the hold already expired or was settled; the order still records payment
    const confirmed = await reservationService.confirmReservation(reservationId);
    if (!confirmed) {
      logger.warn(`[PAYMENT] Reservation ${reservationId} for order ${order.id} was not active`);
    }
  }

  await order.update({ status: PAID_STATUS, paymentIntentId });
  logger.info(`[PAYMENT] Order ${order.id} paid (${paymentIntentId})`);
  return { orderId: order.id, status: PAID_STATUS };
};

/**
 * Called by the storefront after Stripe.js reports success. The server re-checks the intent
 * with Stripe (status, amount, order metadata) before trusting it.
 */
const confirmOrderPayment = async (orderId, caller = {}, paymentIntentId = null) => {
  const order = await loadOwnedOrder(orderId, caller);
  if (order.status === PAID_STATUS) return { orderId: order.id, status: order.status };

  const intentId = paymentIntentId || order.paymentIntentId;
  if (!intentId || intentId !== order.paymentIntentId) {
    throw ApiError.badRequest('Payment intent does not belong to this order');
  }

  if (getProvider() === STRIPE_PROVIDER) {
    const intent = await getStripe().paymentIntents.retrieve(intentId);
    const amountMatches = intent.amount === toMinorUnits(order.totalAmount);
    const orderMatches = String(intent.metadata?.order_id) === String(order.id);
    if (intent.status !== 'succeeded' || !amountMatches || !orderMatches) {
      throw new ApiError(
        402,
        `Payment not completed (status: ${intent.status})`,
        undefined,
        'PAYMENT_NOT_COMPLETED'
      );
    }
  }

  return markOrderPaid(order, intentId);
};

/**
 * Refunds all or part of an order's payment. Mock payments (development/CI) are recorded as
 * refunded without calling Stripe. `amount` is in rupees; omit it for a full refund.
 * @returns {Promise<{ refunded: boolean, provider?: string, refundId?: string }>}
 */
const refundOrderPayment = async (order, amount = null, idempotencyKey = null) => {
  if (!order.paymentIntentId) return { refunded: false };
  const value = amount === null ? Number(order.totalAmount) : Number(amount);
  if (!(value > 0)) return { refunded: false };
  if (String(order.paymentIntentId).startsWith('mock_pi_')) {
    logger.info(`[PAYMENT] Mock refund of LKR ${value} for order ${order.id}`);
    return { refunded: true, provider: MOCK_PROVIDER, amount: value };
  }
  const refund = await getStripe().refunds.create(
    { payment_intent: order.paymentIntentId, amount: toMinorUnits(value) },
    // Callers refunding one returned item pass their own key, so two refunds of the same
    // amount on one order are not collapsed into a single refund by Stripe.
    { idempotencyKey: idempotencyKey || `refund-${order.id}-${toMinorUnits(value)}` }
  );
  logger.info(`[PAYMENT] Refund ${refund.id} of LKR ${value} for order ${order.id}`);
  return { refunded: true, provider: STRIPE_PROVIDER, refundId: refund.id, amount: value };
};

/** Verifies a Stripe webhook signature against the raw request bytes. */
const constructWebhookEvent = (rawPayload, signature) => {
  if (!signature) throw ApiError.badRequest('Missing Stripe-Signature header');
  if (!rawPayload) throw ApiError.badRequest('Missing raw webhook payload body');
  try {
    return getStripe().webhooks.constructEvent(
      rawPayload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error(`[STRIPE] Signature verification failed: ${err.message}`);
    throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
  }
};

/** Handles verified Stripe events; only payment_intent.succeeded changes state. */
const handleWebhookEvent = async (event) => {
  const intent = event?.data?.object;
  const orderId = intent?.metadata?.order_id;
  if (event?.type !== 'payment_intent.succeeded') {
    return { success: true, processed: false, ignoredEvent: event?.type };
  }
  if (!orderId) {
    logger.warn('[STRIPE WEBHOOK] payment_intent.succeeded without metadata.order_id');
    return { success: true, processed: false };
  }

  const order = await Order.findByPk(orderId);
  if (!order) return { success: true, processed: false };
  if (intent.amount !== toMinorUnits(order.totalAmount)) {
    logger.error(`[STRIPE WEBHOOK] Amount mismatch for order ${orderId}`);
    return { success: true, processed: false };
  }
  const result = await markOrderPaid(order, intent.id);
  return { success: true, processed: true, ...result };
};

module.exports = {
  getProvider,
  toMinorUnits,
  createPaymentIntent,
  confirmOrderPayment,
  markOrderPaid,
  refundOrderPayment,
  constructWebhookEvent,
  handleWebhookEvent,
  MOCK_PROVIDER,
  STRIPE_PROVIDER,
};
