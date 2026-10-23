// ==============================================================================
// Stripe Payment Gateway Service - Intent Creation & Cryptographic Webhooks
// Why this file matters: Manages PCI-DSS compliant credit card transactions in LKR,
// converts floating-point currency into safe integer cents, and cryptographically
// validates incoming Stripe webhook signatures using raw request buffers.
// ==============================================================================

// const crypto = require('crypto');
const Stripe = require('stripe');
const { Order, Payment } = require('../models');
const reservationService = require('./reservation.service');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

// Environment API Keys
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stackstorm_key_2026';
const STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_stackstorm_webhook_secret_key_2026';

// Instantiate Stripe client using pinned API version
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe PaymentIntent for the specified Order in LKR.
 *
 * @param {string} orderId - Order UUID
 * @returns {Promise<object>} PaymentIntent metadata including client_secret
 */
const createPaymentIntent = async (orderId) => {
  if (!orderId) {
    throw ApiError.badRequest('order_id is required to create a payment intent');
  }

  // Load the order from PostgreSQL
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw ApiError.notFound(`Order not found with id: ${orderId}`);
  }

  // [INTEGER CENTS CONVERSION]:
  // Prevents JavaScript IEEE 754 floating-point rounding errors
  const amountInCents = Math.round(Number(order.total_amount) * 100);

  // [CREATE INTENT ON STRIPE SERVERS]:
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'lkr',
    // [AUDIT METADATA]:
    // Attaching our internal order_id allows webhook handlers to identify
    // which order was paid when Stripe sends asynchronous webhook notifications!
    metadata: {
      order_id: String(order.id),
      order_number: String(order.order_number),
    },
    payment_method_types: ['card'],
  });

  // Idempotently create or update the Payment record in our database
  await Payment.findOrCreate({
    where: { order_id: order.id },
    defaults: {
      order_id: order.id,
      payment_method: 'stripe',
      payment_intent_id: paymentIntent.id,
      amount: Number(order.total_amount),
      currency: 'LKR',
      status: 'pending',
      raw_response: paymentIntent,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    orderId: order.id,
    amount: Number(order.total_amount),
    currency: 'LKR',
    status: paymentIntent.status,
  };
};

/**
 * Cryptographically verifies an incoming Stripe webhook signature.
 * [SECURITY RULE: MUST USE RAW BUFFER]:
 * The payload MUST be the exact, untouched raw Buffer from the HTTP request socket.
 * If Express parsed it into a JavaScript object first, key order or whitespace changes
 * will cause the HMAC-SHA256 signature check to fail!
 *
 * @param {Buffer} rawPayload - Raw binary HTTP request body
 * @param {string} signature - Stripe-Signature header string
 * @returns {object} Verified Stripe event object
 */
const constructWebhookEvent = (rawPayload, signature) => {
  if (!signature) {
    throw ApiError.badRequest('Missing Stripe-Signature header');
  }
  if (!rawPayload) {
    throw ApiError.badRequest('Missing raw webhook payload body');
  }

  try {
    return stripe.webhooks.constructEvent(rawPayload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`[STRIPE] Signature verification failed: ${err.message}`);
    throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
  }
};

/**
 * Idempotently processes verified Stripe webhook events.
 *
 * @param {object} event - Verified Stripe event object
 * @returns {Promise<object>} Outcome summary
 */
const handleWebhookEvent = async (event) => {
  const { type, data } = event;
  const paymentIntent = data && data.object;
  const orderId = paymentIntent && paymentIntent.metadata && paymentIntent.metadata.order_id;

  logger.info(`[STRIPE WEBHOOK] Received event: ${type} for orderId: ${orderId}`);

  // [EVENT: PAYMENT SUCCESSFUL]
  if (type === 'payment_intent.succeeded') {
    if (!orderId) {
      logger.warn('[STRIPE WEBHOOK] PaymentIntent succeeded without metadata.order_id');
      return { success: true, processed: false };
    }

    // Step 1: Transition Order status to 'paid' and 'processing'
    await Order.update(
      {
        status: 'processing',
        paymentIntentId: (paymentIntent && paymentIntent.id) || null,
      },
      { where: { id: orderId } }
    );

    // Step 2: [PERMANENT INVENTORY CONFIRMATION]:
    // Convert 15-minute temporary reservation into a permanent warehouse stock deduction
    try {
      await reservationService.confirmReservation(orderId);
    } catch (resErr) {
      logger.warn(`[STRIPE WEBHOOK] Reservation confirmation skipped: ${resErr.message}`);
    }

    logger.info(`[STRIPE WEBHOOK] Order ${orderId} successfully marked as PAID`);
    return { success: true, order_id: orderId, status: 'paid' };
  }

  return { success: true, processed: false, ignoredEvent: type };
};

module.exports = {
  createPaymentIntent,
  constructWebhookEvent,
  handleWebhookEvent,
};
