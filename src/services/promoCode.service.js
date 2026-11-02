// ==============================================================================
// Promotional codes (FR-015): admin create/manage, checkout validates and prices a code
// against the order subtotal. Usage is only counted once the order is actually paid
// (see stripe.service.markOrderPaid), so an abandoned checkout does not burn a redemption.
// ==============================================================================

const { UniqueConstraintError } = require('sequelize');
const { PromoCode } = require('../models');
const ApiError = require('../utils/ApiError');

const CODE_MAX = 32;
const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const money = (value, field, { allowZero = true } = {}) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw ApiError.badRequest(`${field} must be a non-negative number`);
  }
  return Number(amount.toFixed(2));
};

const toView = (promo) => ({
  id: promo.id,
  code: promo.code,
  discount_type: promo.discountType,
  discount_value: Number(promo.discountValue),
  min_order_amount: Number(promo.minOrderAmount),
  max_discount_amount: promo.maxDiscountAmount !== null ? Number(promo.maxDiscountAmount) : null,
  start_date: promo.startDate,
  end_date: promo.endDate,
  usage_limit: promo.usageLimit,
  times_used: promo.timesUsed,
  is_active: promo.isActive,
});

const listPromoCodes = async () => {
  const promos = await PromoCode.findAll({ order: [['created_at', 'DESC']] });
  return promos.map(toView);
};

const promoFields = (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.code !== undefined) {
    const code = clean(body.code, CODE_MAX)?.toUpperCase();
    if (!code || !CODE_PATTERN.test(code)) {
      throw ApiError.badRequest(
        'Code must be 3-32 characters: capital letters, numbers and hyphens only'
      );
    }
    fields.code = code;
  }
  if (!partial || body.discount_type !== undefined) {
    const type = body.discount_type;
    if (!['percentage', 'fixed_amount'].includes(type)) {
      throw ApiError.badRequest('Discount type must be "percentage" or "fixed_amount"');
    }
    fields.discountType = type;
  }
  if (!partial || body.discount_value !== undefined) {
    const value = money(body.discount_value, 'Discount value', { allowZero: false });
    if (fields.discountType === 'percentage' && value > 100) {
      throw ApiError.badRequest('A percentage discount cannot exceed 100');
    }
    fields.discountValue = value;
  }
  if (body.min_order_amount !== undefined) {
    fields.minOrderAmount = money(body.min_order_amount, 'Minimum order amount');
  }
  if (body.max_discount_amount !== undefined) {
    fields.maxDiscountAmount =
      body.max_discount_amount === null || body.max_discount_amount === ''
        ? null
        : money(body.max_discount_amount, 'Maximum discount amount');
  }
  if (!partial || body.start_date !== undefined) {
    const start = new Date(body.start_date);
    if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Start date is not valid');
    fields.startDate = start;
  }
  if (!partial || body.end_date !== undefined) {
    const end = new Date(body.end_date);
    if (Number.isNaN(end.getTime())) throw ApiError.badRequest('End date is not valid');
    fields.endDate = end;
  }
  if (fields.startDate && fields.endDate && fields.endDate <= fields.startDate) {
    throw ApiError.badRequest('End date must be after the start date');
  }
  if (body.usage_limit !== undefined) {
    if (body.usage_limit === null || body.usage_limit === '') {
      fields.usageLimit = null;
    } else {
      const limit = Number(body.usage_limit);
      if (!Number.isInteger(limit) || limit < 1) {
        throw ApiError.badRequest('Usage limit must be a positive whole number, or left empty');
      }
      fields.usageLimit = limit;
    }
  }
  if (body.is_active !== undefined) fields.isActive = Boolean(body.is_active);
  return fields;
};

const duplicate = (err) => {
  if (err instanceof UniqueConstraintError) {
    return ApiError.conflict('A promo code with this code already exists');
  }
  return err;
};

const createPromoCode = async (body) => {
  try {
    const promo = await PromoCode.create(promoFields(body));
    return toView(promo);
  } catch (err) {
    throw duplicate(err);
  }
};

const updatePromoCode = async (id, body) => {
  const promo = await PromoCode.findByPk(id);
  if (!promo) throw ApiError.notFound(`Promo code ${id} not found`);
  try {
    await promo.update(promoFields(body, { partial: true }));
    return toView(promo);
  } catch (err) {
    throw duplicate(err);
  }
};

const deletePromoCode = async (id) => {
  const removed = await PromoCode.destroy({ where: { id } });
  if (!removed) throw ApiError.notFound(`Promo code ${id} not found`);
};

/**
 * Checks a code against the order subtotal and prices its discount (FR-015). Throws a 400
 * with a shopper-facing reason when the code cannot be used right now.
 *
 * @returns {Promise<{promoCodeId: number, code: string, discountAmount: number}>}
 */
const validateAndPrice = async (rawCode, subtotal) => {
  const code = clean(rawCode, CODE_MAX)?.toUpperCase();
  if (!code) throw ApiError.badRequest('Enter a promo code');
  const promo = await PromoCode.findOne({ where: { code } });
  if (!promo || !promo.isActive) {
    throw ApiError.badRequest('This promo code is not valid');
  }
  const now = new Date();
  if (now < promo.startDate || now > promo.endDate) {
    throw ApiError.badRequest('This promo code is not active right now');
  }
  if (promo.usageLimit !== null && promo.timesUsed >= promo.usageLimit) {
    throw ApiError.badRequest('This promo code has reached its usage limit');
  }
  const sub = Number(subtotal) || 0;
  if (sub < Number(promo.minOrderAmount)) {
    throw ApiError.badRequest(
      `This code needs a minimum order of LKR ${Number(promo.minOrderAmount).toLocaleString('en-US')}`
    );
  }
  let discount =
    promo.discountType === 'percentage'
      ? sub * (Number(promo.discountValue) / 100)
      : Number(promo.discountValue);
  if (promo.maxDiscountAmount !== null) {
    discount = Math.min(discount, Number(promo.maxDiscountAmount));
  }
  discount = Math.min(discount, sub);
  return {
    promoCodeId: promo.id,
    code: promo.code,
    discountAmount: Number(discount.toFixed(2)),
  };
};

/** Counts one redemption once the order it was applied to is actually paid. */
const recordUsage = async (promoCodeId, transaction) => {
  if (!promoCodeId) return;
  await PromoCode.increment('timesUsed', { by: 1, where: { id: promoCodeId }, transaction });
};

module.exports = {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  validateAndPrice,
  recordUsage,
};
