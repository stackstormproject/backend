const { Loyalty, LoyaltyTransaction, Customer, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const TIER_MULTIPLIERS = {
  silver: 1.0,
  gold: 1.5,
  platinum: 2.0,
};

const TIER_BENEFITS = {
  silver: [
    'Earn 1.0 loyalty point per LKR 100 spent',
    'Standard seasonal promotions',
    'Birthday reward voucher (500 LKR)',
  ],
  gold: [
    'Earn 1.5 loyalty points per LKR 100 spent',
    'Free express shipping on all orders over LKR 7,500',
    'Exclusive early access to seasonal batik drops',
    'Birthday reward voucher (1,000 LKR)',
  ],
  platinum: [
    'Earn 2.0 loyalty points per LKR 100 spent',
    'Always free priority shipping with zero order minimum',
    'Dedicated VIP styling concierge and live chat priority',
    'Complimentary tailoring and size adjustments at Dickwella boutique',
    'Birthday reward voucher (2,500 LKR)',
  ],
};

/**
 * Calculates reward points earned from a purchase based on customer tier multiplier.
 *
 * @param {number} orderAmount
 * @param {string} tier
 * @returns {number}
 */
const calculatePoints = (orderAmount, tier = 'silver') => {
  const num = Number(orderAmount);
  if (!num || num <= 0) return 0;
  const multiplier = TIER_MULTIPLIERS[tier.toLowerCase()] || 1.0;
  return Math.floor((num / 100) * multiplier);
};

/**
 * Retrieves loyalty account overview and tier status.
 *
 * @param {number|string} customerId
 * @returns {Promise<object>}
 */
const getLoyaltyAccount = async (customerId) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  let account = await Loyalty.findOne({ where: { customerId } });

  if (!account) {
    const customer = await Customer.findByPk(customerId);
    const initialTier = customer?.loyaltyTier || 'silver';
    const initialPoints = customer?.loyaltyPoints || 0;

    account = await Loyalty.create({
      customerId,
      tier: initialTier,
      currentPoints: initialPoints,
      lifetimePoints: initialPoints,
      tierStartDate: new Date(),
    });
  }

  const tier = account.tier || 'silver';
  const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
  const benefits = TIER_BENEFITS[tier] || TIER_BENEFITS.silver;

  return {
    customer_id: account.customerId,
    customerId: account.customerId,
    tier,
    loyalty_tier: tier,
    current_points: account.currentPoints,
    currentPoints: account.currentPoints,
    lifetime_points: account.lifetimePoints,
    lifetimePoints: account.lifetimePoints,
    tier_multiplier: multiplier,
    tier_start_date: account.tierStartDate,
    benefits,
  };
};

/**
 * Retrieves paginated transaction history for the customer's loyalty account.
 *
 * @param {number|string} customerId
 * @param {object} options
 * @returns {Promise<object>}
 */
const getLoyaltyTransactions = async (customerId, options = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await LoyaltyTransaction.findAndCountAll({
    where: { customerId },
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  const transactions = rows.map((t) => ({
    id: t.id,
    customer_id: t.customerId,
    points: t.points,
    transaction_type: t.transactionType,
    description: t.description,
    expires_at: t.expiresAt,
    is_expired: t.isExpired,
    created_at: t.createdAt,
  }));

  return {
    transactions,
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Redeems points from customer loyalty account.
 *
 * @param {number|string} customerId
 * @param {number} pointsToRedeem
 * @param {string} [description]
 * @returns {Promise<object>}
 */
const redeemPoints = async (customerId, pointsToRedeem, description = 'Points redemption') => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const points = parseInt(pointsToRedeem, 10);
  if (!points || points <= 0) {
    throw ApiError.badRequest('Points to redeem must be a positive integer');
  }

  // Row lock: two simultaneous redemptions must not both spend the same points.
  const newBalance = await sequelize.transaction(async (t) => {
    const account = await Loyalty.findOne({
      where: { customerId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!account || account.currentPoints < points) {
      throw ApiError.conflict('Insufficient loyalty points balance');
    }
    const balance = account.currentPoints - points;
    await account.update({ currentPoints: balance }, { transaction: t });
    await LoyaltyTransaction.create(
      { customerId, points: -points, transactionType: 'redeemed', description },
      { transaction: t }
    );
    await Customer.update(
      { loyaltyPoints: balance },
      { where: { id: customerId }, transaction: t }
    );
    return balance;
  });

  logger.info(
    `[LOYALTY] Customer ${customerId} redeemed ${points} points. New balance: ${newBalance}`
  );

  return {
    success: true,
    redeemed_points: points,
    new_balance: newBalance,
  };
};

module.exports = {
  getLoyaltyAccount,
  getLoyaltyTransactions,
  redeemPoints,
  calculatePoints,
  TIER_MULTIPLIERS,
  TIER_BENEFITS,
};
