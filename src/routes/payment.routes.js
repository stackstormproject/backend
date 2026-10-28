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
 * @route   POST /payments/webhook
 * @desc    Stripe webhook; body is the raw Buffer so the HMAC signature can be verified
 * @access  Public (Stripe servers, signature required)
 */
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
