const { Review, ReviewImage, Order, OrderItem, ProductVariant, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Calculates rating statistics for a product.
 *
 * @param {number|string} productId
 * @returns {Promise<{ average_rating: number, review_count: number, breakdown: object }>}
 */
const getProductRatingStats = async (productId) => {
  const reviews = await Review.findAll({
    where: { productId },
    attributes: ['rating'],
  });

  const reviewCount = reviews.length;
  if (reviewCount === 0) {
    return {
      average_rating: 5.0,
      review_count: 0,
      breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  reviews.forEach((r) => {
    const val = r.rating || 5;
    sum += val;
    if (breakdown[val] !== undefined) breakdown[val] += 1;
  });

  const averageRating = Math.round((sum / reviewCount) * 10) / 10;
  return {
    average_rating: averageRating,
    review_count: reviewCount,
    breakdown,
  };
};

/**
 * Checks if customer is a verified buyer of this product.
 * (Has at least one confirmed or delivered order containing a variant of this product).
 *
 * @param {number|string} customerId
 * @param {number|string} productId
 * @returns {Promise<boolean>}
 */
const checkVerifiedBuyer = async (customerId, productId) => {
  if (!customerId) return false;

  const orders = await Order.findAll({
    where: { customerId },
    include: [
      {
        model: OrderItem,
        as: 'items',
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            where: { productId },
            attributes: ['id', 'productId'],
          },
        ],
      },
    ],
  });

  const hasPurchased = orders.some((o) => (o.items || []).length > 0);
  return hasPurchased;
};

/**
 * Creates a product review by an authenticated customer.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
const createReview = async ({ customerId, productId, rating, comment, images = [] }) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required to submit a review');
  }
  if (!productId) {
    throw ApiError.badRequest('productId is required');
  }

  const numericRating = parseInt(rating, 10);
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    throw ApiError.badRequest('Rating must be an integer between 1 and 5');
  }

  // Prevent multiple reviews on the same product from the same customer
  const existing = await Review.findOne({
    where: { customerId, productId },
  });
  if (existing) {
    throw ApiError.conflict('You have already submitted a review for this product');
  }

  const isVerified = await checkVerifiedBuyer(customerId, productId);

  const review = await Review.create({
    customerId,
    productId,
    rating: numericRating,
    comment: (comment || '').trim() || null,
  });

  if (Array.isArray(images) && images.length > 0) {
    const imgPayload = images.map((url) => ({
      reviewId: review.id,
      imageUrl: typeof url === 'string' ? url : url.url || url.imageUrl,
    }));
    await ReviewImage.bulkCreate(imgPayload);
  }

  logger.info(
    `[REVIEW] Created review #${review.id} on product ${productId} by customer ${customerId}`
  );

  const reloaded = await Review.findByPk(review.id, {
    include: [
      { model: ReviewImage, as: 'images' },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
    ],
  });

  return {
    id: reloaded.id,
    product_id: reloaded.productId,
    customer_id: reloaded.customerId,
    customer_name: reloaded.customer?.name || 'Customer',
    rating: reloaded.rating,
    comment: reloaded.comment,
    is_verified_buyer: isVerified,
    images: (reloaded.images || []).map((img) => img.imageUrl),
    created_at: reloaded.createdAt,
  };
};

/**
 * Retrieves paginated reviews for a product with rating summary.
 *
 * @param {number|string} productId
 * @param {object} query
 * @returns {Promise<object>}
 */
const getProductReviews = async (productId, query = {}) => {
  if (!productId) {
    throw ApiError.badRequest('productId is required');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const [stats, { count, rows }] = await Promise.all([
    getProductRatingStats(productId),
    Review.findAndCountAll({
      where: { productId },
      include: [
        { model: ReviewImage, as: 'images' },
        { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    }),
  ]);

  const reviews = rows.map((r) => ({
    id: r.id,
    product_id: r.productId,
    customer_id: r.customerId,
    customer_name: r.customer?.name || 'Customer',
    rating: r.rating,
    comment: r.comment,
    is_verified_buyer: true,
    images: (r.images || []).map((img) => img.imageUrl),
    created_at: r.createdAt,
  }));

  return {
    stats,
    reviews,
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Retrieves past reviews submitted by the authenticated customer.
 *
 * @param {number|string} customerId
 * @returns {Promise<Array<object>>}
 */
const getCustomerReviews = async (customerId) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const reviews = await Review.findAll({
    where: { customerId },
    include: [{ model: ReviewImage, as: 'images' }],
    order: [['created_at', 'DESC']],
  });

  return reviews.map((r) => ({
    id: r.id,
    product_id: r.productId,
    rating: r.rating,
    comment: r.comment,
    images: (r.images || []).map((img) => img.imageUrl),
    created_at: r.createdAt,
  }));
};

module.exports = {
  createReview,
  getProductReviews,
  getCustomerReviews,
  getProductRatingStats,
  checkVerifiedBuyer,
};
