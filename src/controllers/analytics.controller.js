const analyticsService = require('../services/analytics.service');
const { successResponse } = require('../utils/responseFormatter');

/**
 * Retrieves dashboard overview metrics.
 * Route: GET /admin/analytics
 */
const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getAnalyticsOverview();
    return successResponse(res, data, 'Analytics overview retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves platform orders for admin management.
 * Route: GET /admin/orders
 */
const getOrders = async (req, res, next) => {
  try {
    const data = await analyticsService.getAllOrders(req.query);
    return successResponse(res, data, 'Orders list retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates order status.
 * Route: PATCH /admin/orders/:id/status
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const trackingNumber = req.body.tracking_number || req.body.trackingNumber;

    const updated = await analyticsService.updateOrderStatus(id, status, trackingNumber);
    return successResponse(res, updated, 'Order status updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOverview,
  getOrders,
  updateOrderStatus,
};
