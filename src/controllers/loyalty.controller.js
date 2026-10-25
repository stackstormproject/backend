const loyaltyService = require('../services/loyalty.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Retrieves loyalty tier status and balance.
 * Route: GET /loyalty, GET /loyalty/balance
 */
const getAccount = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const account = await loyaltyService.getLoyaltyAccount(customerId);
    return successResponse(res, account, 'Loyalty account retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves transaction history.
 * Route: GET /loyalty/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await loyaltyService.getLoyaltyTransactions(customerId, req.query);
    return successResponse(res, result, 'Loyalty transactions retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Redeems points from account.
 * Route: POST /loyalty/redeem
 */
const redeemPoints = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const { points, description } = req.body;
    const result = await loyaltyService.redeemPoints(customerId, points, description);
    return successResponse(res, result, 'Points redeemed successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAccount,
  getTransactions,
  redeemPoints,
};
