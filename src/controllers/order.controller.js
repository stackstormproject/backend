const orderService = require('../services/order.service');
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

/**
 * Finalizes an order upon payment completion.
 * Route: POST /orders/:id/finalize
 */
const finalizeOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paymentDetails = req.body.payment_details || req.body;
    const result = await orderService.finalizeOrder(id, paymentDetails);
    return successResponse(res, result, 'Order finalized successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOrderById,
  getMyOrders,
  trackOrder,
  finalizeOrder,
};
