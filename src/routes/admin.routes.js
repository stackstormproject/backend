const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const supportController = require('../controllers/support.controller');
const adminOrderController = require('../controllers/adminOrder.controller');
const adminInventoryController = require('../controllers/adminInventory.controller');
const adminProductController = require('../controllers/adminProduct.controller');
const adminReturnController = require('../controllers/adminReturn.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { MANAGER_ROLES, SUPPORT_ROLES } = require('../config/constants');

const router = express.Router();

const managers = rbac(MANAGER_ROLES);
const support = rbac(SUPPORT_ROLES);

router.use(auth);

router.get('/analytics', managers, analyticsController.getOverview);
router.get('/analytics/overview', managers, analyticsController.getOverview);
router.get('/analytics/sales-trend', managers, analyticsController.getSalesTrend);

router.get('/orders', managers, adminOrderController.list);
router.get('/orders/:id', managers, adminOrderController.detail);
router.patch('/orders/:id/status', managers, adminOrderController.updateStatus);

router.get('/products', managers, adminProductController.list);
router.post('/products', managers, adminProductController.create);
router.get('/products/:id', managers, adminProductController.detail);
router.put('/products/:id', managers, adminProductController.update);
router.delete('/products/:id', managers, adminProductController.remove);
router.post('/products/:id/variants', managers, adminProductController.addVariant);
router.patch('/products/:id/variants/:variantId', managers, adminProductController.updateVariant);
router.delete('/products/:id/variants/:variantId', managers, adminProductController.removeVariant);

router.get('/returns', managers, adminReturnController.list);
router.get('/returns/:id', managers, adminReturnController.detail);
router.post('/returns/:id/approve', managers, adminReturnController.approve);
router.post('/returns/:id/reject', managers, adminReturnController.reject);
router.post('/returns/:id/receive', managers, adminReturnController.receive);

router.get('/inventory', managers, adminInventoryController.list);
router.post('/inventory/:variantId/adjust', managers, adminInventoryController.adjust);
router.get('/inventory/:variantId/logs', managers, adminInventoryController.logs);

router.get('/support/sessions', support, supportController.getSupportSessions);
router.patch('/support/sessions/:id/status', support, supportController.updateSessionStatus);

module.exports = router;
