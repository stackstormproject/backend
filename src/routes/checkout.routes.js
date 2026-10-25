const express = require('express');
const checkoutController = require('../controllers/checkout.controller');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

/**
 * @route   POST /checkout/initiate
 * @desc    Initiate checkout for guest or registered customer with shipping address
 * @access  Public (Guest or Authenticated)
 */
router.post('/initiate', checkoutController.initiate);

/**
 * @route   POST /checkout/reserve
 * @desc    Reserve variant inventory for 15 minutes during checkout
 * @access  Public (Guest or Authenticated)
 */
router.post('/reserve', checkoutController.reserve);

/**
 * @route   POST /checkout/release/:reservationId
 * @desc    Release reserved inventory back to available stock
 * @access  Public (Guest or Authenticated)
 */
router.post('/release/:reservationId', checkoutController.release);
router.delete('/release/:reservationId', checkoutController.release);

/**
 * @route   POST /checkout/confirm/:reservationId
 * @desc    Permanently deduct reserved inventory upon successful payment
 * @access  Public (Guest or Authenticated)
 */
router.post('/confirm/:reservationId', checkoutController.confirm);

module.exports = router;
