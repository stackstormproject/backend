const returnService = require('../services/return.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Submits return or exchange request.
 * Route: POST /returns
 */
const requestReturn = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await returnService.requestReturn({
      ...req.body,
      customerId,
      orderItemId: req.body.orderItemId || req.body.order_item_id,
      exchangeVariantId: req.body.exchangeVariantId || req.body.exchange_variant_id,
    });

    return successResponse(res, result, 'Return request submitted successfully', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves past return requests for the authenticated customer.
 * Route: GET /returns/my-returns
 */
const getMyReturns = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await returnService.getCustomerReturns(customerId, req.query);
    return successResponse(res, result, 'Customer return requests retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves details for a specific return request.
 * Route: GET /returns/:id
 */
const getReturnById = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await returnService.getReturnById(req.params.id, customerId);
    return successResponse(res, result, 'Return request retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  requestReturn,
  getMyReturns,
  getReturnById,
};
