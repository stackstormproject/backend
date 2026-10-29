// ==============================================================================
// Checkout Domain Service - Address Sanitization, Order Creation & Shipping Rules
// Why this file matters: Enforces Sri Lankan shipping validation, applies the
// 10,000 LKR free shipping threshold, and builds the immutable Order contract.
// ==============================================================================

const crypto = require('crypto');
const { Order, OrderItem, ProductVariant, Product, sequelize } = require('../models');
const reservationService = require('./reservation.service');
const promoCodeService = require('./promoCode.service');
const loyaltyService = require('./loyalty.service');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

// Business Rule Constants
const FREE_SHIPPING_THRESHOLD_LKR = 10000.0; // 10,000 LKR
const STANDARD_SHIPPING_FEE_LKR = 450.0; // 450 LKR flat rate
const SHIPPING_METHODS = ['standard', 'pickup'];

/**
 * Validates Sri Lankan shipping destination address attributes.
 *
 * @param {object} address - Inbound address object from checkout form
 * @returns {object} Cleaned, standardized address snapshot
 */
const validateShippingAddress = (address) => {
  if (!address || typeof address !== 'object') {
    throw ApiError.badRequest('Shipping address is required');
  }

  const line1 = (address.line1 || address.address_line1 || address.street || '').trim();
  const city = (address.city || '').trim();
  const postalCode = (address.postal_code || address.postalCode || '').trim();
  const district = (address.district || address.state || address.province || '').trim();
  const country = (address.country || 'Sri Lanka').trim();

  // Guard: Mandatory street address
  if (!line1) {
    throw ApiError.badRequest('Shipping address line 1 is required');
  }
  // Guard: Mandatory town / city
  if (!city) {
    throw ApiError.badRequest('Shipping address city is required');
  }

  // [SRI LANKAN POSTAL CODE REGEX VALIDATION]:
  // Sri Lankan postal codes consist of exactly 5 numeric digits (e.g. 81200 for Dickwella)
  const postalRegex = /^[0-9]{5}$/;
  if (!postalCode || !postalRegex.test(postalCode)) {
    throw ApiError.badRequest(
      `Invalid postal code: "${postalCode}". Sri Lankan postal codes must be exactly 5 digits (e.g. 81200).`
    );
  }

  return {
    line1,
    line2: (address.line2 || address.address_line2 || '').trim() || null,
    city,
    district: district || null,
    postal_code: postalCode,
    country,
  };
};

/**
 * Calculates dynamic shipping fee based on order subtotal and fulfillment method.
 *
 * @param {number} subtotal - Garment items sum in LKR
 * @param {string} [method='standard'] - 'standard' or 'pickup'
 * @returns {number} Shipping fee in LKR
 */
const calculateShippingFee = (subtotal, method = 'standard') => {
  // Store pickup at Dickwella boutique is always free
  if (method === 'pickup') {
    return 0.0;
  }
  // Free delivery threshold: Orders >= 10,000 LKR qualify for free shipping!
  if (subtotal >= FREE_SHIPPING_THRESHOLD_LKR) {
    return 0.0;
  }
  return STANDARD_SHIPPING_FEE_LKR;
};

/**
 * Generates an immutable, human-readable sales invoice identifier.
 * Format: DFC-YYYYMMDD-XXXX (e.g. "DFC-20261020-4821")
 */
const generateOrderNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DFC-${dateStr}-${rand}`;
};

/**
 * Validates email format.
 *
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).trim());
};

/**
 * Initiates checkout for guest or authenticated customer.
 * Creates an Order in 'payment_pending' status, reserves inventory for 15 minutes,
 * and snapshots order line items.
 *
 * @param {object} checkoutData
 * @returns {Promise<object>} Order summary envelope with LKR totals and reservation metadata
 */
const initiateCheckout = async (checkoutData = {}) => {
  const customerId = checkoutData.customerId || checkoutData.userId || null;
  const guestEmail = (checkoutData.guestEmail || checkoutData.guest_email || '').trim();
  const rawItems = checkoutData.items || [];
  const rawAddress = checkoutData.shippingAddress || checkoutData.shipping_address;
  const rawBillingAddress = checkoutData.billingAddress || checkoutData.billing_address;
  const shippingMethod =
    checkoutData.shippingMethod ||
    checkoutData.shipping_method ||
    checkoutData.shippingOption ||
    'standard';
  if (!SHIPPING_METHODS.includes(shippingMethod)) {
    throw ApiError.badRequest(`Shipping method must be one of: ${SHIPPING_METHODS.join(', ')}`);
  }
  const notes = checkoutData.notes || null;

  // 1. Identity validation: Guests must provide a valid email
  if (!customerId) {
    if (!guestEmail) {
      throw ApiError.badRequest('Guest checkout requires a valid email address');
    }
    if (!isValidEmail(guestEmail)) {
      throw ApiError.badRequest('Invalid guest email address format');
    }
  }

  // 2. Validate shipping address
  const shippingAddressSnapshot = validateShippingAddress(rawAddress);
  const billingAddressSnapshot = rawBillingAddress
    ? validateShippingAddress(rawBillingAddress)
    : shippingAddressSnapshot;

  // 3. Validate line items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw ApiError.badRequest('Checkout items list must contain at least one line item');
  }

  const normalizedItems = rawItems.map((item) => {
    const variantId = Number(item.variant_id ?? item.variantId ?? item.id);
    const quantity = parseInt(item.quantity, 10);
    if (!variantId || Number.isNaN(variantId)) {
      throw ApiError.badRequest('Each checkout item must have a valid variant_id');
    }
    if (!quantity || quantity < 1) {
      throw ApiError.badRequest('Item quantity must be a positive integer greater than 0');
    }
    return { variantId, quantity };
  });

  // 4. Resolve Item Prices, Snapshot Data, and Calculate Totals
  const variantIds = normalizedItems.map((i) => i.variantId);
  const variants = await ProductVariant.findAll({
    where: { id: variantIds },
    include: [{ model: Product, as: 'product' }],
  });

  const variantMap = new Map();
  variants.forEach((v) => variantMap.set(Number(v.id), v));

  let subtotal = 0;
  const resolvedItems = normalizedItems.map((reqItem) => {
    const dbVariant = variantMap.get(reqItem.variantId);
    if (!dbVariant) {
      throw ApiError.notFound(`Variant with ID '${reqItem.variantId}' not found`);
    }

    const prod = dbVariant.product || {};
    if (prod.isActive === false) {
      throw ApiError.conflict(`'${prod.name}' is no longer sold. Remove it from your bag.`);
    }
    // Product price plus the variant surcharge (e.g. XXL). Never trust a client-sent price.
    const unitPrice = Number(
      (Number(prod.price || 0) + Number(dbVariant.additionalPrice || 0)).toFixed(2)
    );
    if (!(unitPrice > 0)) {
      throw ApiError.badRequest(`Variant '${dbVariant.sku}' has no valid price`);
    }
    const lineTotal = Number((unitPrice * reqItem.quantity).toFixed(2));
    subtotal += lineTotal;

    return {
      variantId: dbVariant.id,
      product_variant_id: dbVariant.id,
      quantity: reqItem.quantity,
      unitPrice,
      unit_price: unitPrice,
      subtotal: lineTotal,
      total_price: lineTotal,
      title: prod.name || 'Apparel Item',
      product_id: prod.id || null,
      slug: prod.slug || null,
      sku: dbVariant.sku,
      size: dbVariant.size,
      color: dbVariant.color,
    };
  });

  // 5. Price any promo code and loyalty-point redemption (Sprint 13, FR-015)
  const rawPromoCode = (checkoutData.promoCode || checkoutData.promo_code || '').trim();
  const rawRedeemPoints = checkoutData.redeemPoints ?? checkoutData.redeem_points;

  let promoCodeId = null;
  let appliedPromoCode = null;
  let promoDiscount = 0;
  if (rawPromoCode) {
    const priced = await promoCodeService.validateAndPrice(rawPromoCode, subtotal);
    promoCodeId = priced.promoCodeId;
    appliedPromoCode = priced.code;
    promoDiscount = priced.discountAmount;
  }

  let loyaltyPointsRedeemed = 0;
  let loyaltyDiscount = 0;
  const requestedPoints = parseInt(rawRedeemPoints, 10);
  if (requestedPoints > 0) {
    if (!customerId) {
      throw ApiError.badRequest('Sign in to redeem loyalty points');
    }
    loyaltyDiscount = await loyaltyService.priceRedemption(customerId, requestedPoints);
    loyaltyPointsRedeemed = requestedPoints;
  }

  // 6. Calculate shipping & totals
  const shippingFee = calculateShippingFee(subtotal, shippingMethod);
  const discountAmount = Number(Math.min(promoDiscount + loyaltyDiscount, subtotal).toFixed(2));
  const totalAmount = Number((subtotal + shippingFee - discountAmount).toFixed(2));
  const guestOrderToken = !customerId ? crypto.randomBytes(16).toString('hex') : null;

  // 7. 15-Minute Temporary Stock Reservation
  const reservationResult = await reservationService.reserveStock({
    customerId,
    items: normalizedItems,
  });

  const reservationId = reservationResult.reservation_id;

  // 8. Persist Order and Line Items in Managed DB Transaction
  let createdOrder;
  const createOrderAction = async (t) => {
    const orderRecord = await Order.create(
      {
        customerId: customerId || null,
        guestEmail: customerId ? null : guestEmail,
        guestOrderToken,
        orderDate: new Date(),
        status: 'payment_pending',
        shippingAddress: JSON.stringify(shippingAddressSnapshot),
        billingAddress: JSON.stringify(billingAddressSnapshot),
        shippingOption: shippingMethod,
        shippingCost: shippingFee,
        taxAmount: 0.0,
        discountAmount,
        totalAmount,
        notes,
        promoCodeId,
        loyaltyPointsRedeemed,
      },
      { transaction: t }
    );

    const lineItemsPayload = resolvedItems.map((item) => ({
      orderId: orderRecord.id,
      productVariantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    }));

    await OrderItem.bulkCreate(lineItemsPayload, { transaction: t });
    // Link the stock hold to its order so payment success can confirm it by order id.
    await sequelize.query('UPDATE stock_reservations SET order_id = :orderId WHERE id = :id', {
      replacements: { orderId: orderRecord.id, id: reservationId },
      transaction: t,
    });
    return orderRecord;
  };

  try {
    createdOrder = await sequelize.transaction(createOrderAction);
  } catch (err) {
    // Do not leave stock held for 15 minutes by an order that was never created.
    await reservationService.releaseReservation(reservationId).catch((releaseErr) => {
      logger.error(`[CHECKOUT] Could not release ${reservationId}: ${releaseErr.message}`);
    });
    throw err;
  }

  logger.info(
    `[CHECKOUT] Order #${createdOrder.id} initiated for customer ${customerId || 'guest'} (reservation: ${reservationId})`
  );

  return {
    order_id: createdOrder.id,
    orderId: createdOrder.id,
    customer_id: customerId,
    customerId,
    is_guest: !customerId,
    guest_order_token: guestOrderToken,
    guestOrderToken,
    status: createdOrder.status,
    reservation_id: reservationId,
    reservationId,
    expires_in: reservationService.RESERVATION_TTL_SECONDS || 900,
    currency: 'LKR',
    breakdown: {
      subtotal: Number(subtotal.toFixed(2)),
      shipping_fee: Number(shippingFee.toFixed(2)),
      discount_amount: Number(discountAmount.toFixed(2)),
      promo_discount: Number(promoDiscount.toFixed(2)),
      loyalty_discount: Number(loyaltyDiscount.toFixed(2)),
      total_amount: totalAmount,
      formatted_subtotal: `LKR ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      formatted_shipping: `LKR ${shippingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      formatted_total: `LKR ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    },
    promo_code: appliedPromoCode,
    loyalty_points_redeemed: loyaltyPointsRedeemed,
    items: resolvedItems,
    shipping_address: shippingAddressSnapshot,
    billing_address: billingAddressSnapshot,
    created_at: createdOrder.orderDate || createdOrder.createdAt,
  };
};

module.exports = {
  validateShippingAddress,
  calculateShippingFee,
  generateOrderNumber,
  isValidEmail,
  initiateCheckout,
  FREE_SHIPPING_THRESHOLD_LKR,
  STANDARD_SHIPPING_FEE_LKR,
  SHIPPING_METHODS,
};
