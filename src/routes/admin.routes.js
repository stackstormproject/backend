const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.use(auth);
router.use(rbac(['admin', 'super_admin']));

router.get('/analytics', analyticsController.getOverview);
router.get('/analytics/overview', analyticsController.getOverview);
router.get('/analytics/sales-trend', analyticsController.getSalesTrend);

router.get('/orders', analyticsController.getOrders);
router.patch('/orders/:id/status', analyticsController.updateOrderStatus);

module.exports = router;
