const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.use(auth);
router.use(rbac(['admin']));

router.get('/analytics', analyticsController.getOverview);
router.get('/analytics/overview', analyticsController.getOverview);

router.get('/orders', analyticsController.getOrders);
router.patch('/orders/:id/status', analyticsController.updateOrderStatus);

module.exports = router;
