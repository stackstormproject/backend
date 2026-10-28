const orderService = require('../services/order.service');
const { sendInvoice } = require('../utils/sendInvoice');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Retrieves order details by ID.
 * Route: GET /orders/:id
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customerId = req.user ? req.user.userId || req.user.id : null;
    const guestToken = req.query.guest_token || req.headers['x-guest-token'] || null;

    const order = await orderService.getOrderById(id, customerId, guestToken);
    return successResponse(res, order, 'Order retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Downloads the PDF invoice of a paid order; same ownership rules as reading the order.
 * Route: GET /orders/:id/invoice (#174)
 */
const downloadInvoice = async (req, res, next) => {
  try {
    const customerId = req.user ? req.user.userId || req.user.id : null;
    const guestToken = req.query.guest_token || req.headers['x-guest-token'] || null;
    const order = await orderService.getOrderById(req.params.id, customerId, guestToken);
    return await sendInvoice(res, order);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves paginated list of past orders for the authenticated customer.
 * Route: GET /orders, GET /orders/my-orders
 */
const getMyOrders = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await orderService.getCustomerOrders(customerId, req.query);
    return successResponse(res, result, 'Customer orders retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves delivery milestone timeline for an order.
 * Route: GET /orders/:id/track, GET /orders/:id/tracking
 */
const trackOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customerId = req.user ? req.user.userId || req.user.id : null;
    const guestToken = req.query.guest_token || req.headers['x-guest-token'] || null;

    const tracking = await orderService.getOrderTracking(id, customerId, guestToken);
    return successResponse(res, tracking, 'Order tracking details retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOrderById,
  downloadInvoice,
  getMyOrders,
  trackOrder,
};
