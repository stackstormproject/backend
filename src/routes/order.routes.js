const express = require('express');
const orderController = require('../controllers/order.controller');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/my-orders', auth, orderController.getMyOrders);
router.get('/', auth, orderController.getMyOrders);

router.get('/:id/track', optionalAuth, orderController.trackOrder);
router.get('/:id/tracking', optionalAuth, orderController.trackOrder);
router.get('/:id', optionalAuth, orderController.getOrderById);

module.exports = router;
