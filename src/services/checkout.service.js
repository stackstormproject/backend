// ==============================================================================
// Checkout Domain Service - Address Sanitization, Order Creation & Shipping Rules
// Why this file matters: Enforces Sri Lankan shipping validation, applies the
// 10,000 LKR free shipping threshold, and builds the immutable Order contract.
// ==============================================================================

// const { Order, OrderItem, ProductVariant, Product, sequelize } = require('../models');
const reservationService = require('./reservation.service');
const ApiError = require('../utils/ApiError');

// Business Rule Constants
const FREE_SHIPPING_THRESHOLD_LKR = 10000.0; // 10,000 LKR
const STANDARD_SHIPPING_FEE_LKR = 450.0;     // 450 LKR flat rate

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

module.exports = {
  validateShippingAddress,
  calculateShippingFee,
  generateOrderNumber,
  FREE_SHIPPING_THRESHOLD_LKR,
  STANDARD_SHIPPING_FEE_LKR,
};
