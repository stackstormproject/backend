const express = require('express');
const paymentController = require('../controllers/payment.controller');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /payments/create-intent
 * @desc    Create or reuse the PaymentIntent for a payment_pending order (amount from DB)
 * @access  Order owner: customer bearer token, or guest X-Guest-Token
 */
router.post('/create-intent', optionalAuth, paymentController.createPaymentIntent);

/**
 * @route   POST /payments/confirm
 * @desc    Server-side verification of the PaymentIntent, then mark the order paid
 * @access  Order owner: customer bearer token, or guest X-Guest-Token
 */
router.post('/confirm', optionalAuth, paymentController.confirmPayment);

/**
 * @route   POST /payments/checkout-session
 * @desc    Start payment on the hosted payment page; returns the URL to send the shopper to
 * @access  Order owner: customer bearer token, or guest X-Guest-Token
 */
router.post('/checkout-session', optionalAuth, paymentController.createCheckoutSession);

/**
 * @route   POST /payments/confirm-session
 * @desc    The shopper is back from the payment page: verify the session, mark the order paid
 * @access  Order owner: customer bearer token, or guest X-Guest-Token
 */
router.post('/confirm-session', optionalAuth, paymentController.confirmCheckoutSession);

/**
 * @route   POST /payments/webhook
 * @desc    Stripe webhook; body is the raw Buffer so the HMAC signature can be verified
 * @access  Public (Stripe servers, signature required)
 */
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
