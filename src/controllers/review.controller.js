const reviewService = require('../services/review.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Submits verified buyer review for a product.
 * Route: POST /reviews/products/:productId, POST /reviews
 */
const createReview = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const productId =
      req.params.productId || req.params.id || req.body.product_id || req.body.productId;
    const { rating, comment, images } = req.body;

    const result = await reviewService.createReview({
      customerId,
      productId,
      rating,
      comment,
      images,
    });

    return successResponse(res, result, 'Review submitted successfully', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves paginated reviews for a product.
 * Route: GET /reviews/products/:productId
 */
const getProductReviews = async (req, res, next) => {
  try {
    const productId = req.params.productId || req.params.id;
    const result = await reviewService.getProductReviews(productId, req.query);
    return successResponse(res, result, 'Product reviews retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves reviews written by the authenticated customer.
 * Route: GET /reviews/my-reviews
 */
const getMyReviews = async (req, res, next) => {
  try {
    const customerId = req.user && (req.user.userId || req.user.id);
    if (!customerId) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const result = await reviewService.getCustomerReviews(customerId);
    return successResponse(res, result, 'Customer reviews retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createReview,
  getProductReviews,
  getMyReviews,
};
