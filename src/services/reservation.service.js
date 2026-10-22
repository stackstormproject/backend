const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const RESERVATION_TTL_SECONDS = 900; // 15 minutes

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

/**
 * Validates items, merges duplicate variant lines, and sorts by variant id.
 * A fixed lock order stops two carts like [A,B] and [B,A] deadlocking each other.
 */
const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item must be specified for stock reservation');
  }

  const merged = new Map();
  items.forEach((item) => {
    const variantId = Number(item.variant_id ?? item.variantId);
    const quantity = Number(item.quantity);
    if (!isPositiveInt(variantId)) {
      throw ApiError.badRequest('variant_id must be a positive integer');
    }
    if (!isPositiveInt(quantity)) {
      throw ApiError.badRequest(`Invalid quantity for variant ${variantId}`);
    }
    merged.set(variantId, (merged.get(variantId) || 0) + quantity);
  });

  return [...merged.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((a, b) => a.variantId - b.variantId);
};

/**
 * Reserves stock for ttlSeconds.
 * The database ledger is the source of truth; Redis is only a fast-path cache.
 * The DB transaction lasts milliseconds. The 15-minute hold is just a row with expires_at.
 */
const reserveStock = async ({
  customerId = null,
  orderId = null,
  items = [],
  ttlSeconds = RESERVATION_TTL_SECONDS,
} = {}) => {
  const normalizedItems = normalizeItems(items);
  const reservationId = `res_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const t = await sequelize.transaction();
  try {
    // eslint-disable-next-line no-restricted-syntax
    for (const item of normalizedItems) {
      // Row lock: concurrent reservations of this variant queue here
      // eslint-disable-next-line no-await-in-loop
      const [variant] = await sequelize.query(
        `SELECT id, sku, stock_quantity, reserved_quantity
           FROM product_variants WHERE id = :id FOR UPDATE`,
        { replacements: { id: item.variantId }, type: QueryTypes.SELECT, transaction: t }
      );
      if (!variant) throw ApiError.notFound(`Variant ${item.variantId} not found`);

      const available = variant.stock_quantity - variant.reserved_quantity;
      if (available < item.quantity) {
        throw ApiError.conflict(
          `INSUFFICIENT_STOCK for variant ${variant.sku}. Available: ${Math.max(0, available)}, Requested: ${item.quantity}`
        );
      }

      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(
        `UPDATE product_variants
            SET reserved_quantity = reserved_quantity + :qty, updated_at = NOW()
          WHERE id = :id`,
        { replacements: { qty: item.quantity, id: item.variantId }, transaction: t }
      );
    }

    // Ledger rows go in the SAME transaction as the stock change
    await sequelize.query(
      `INSERT INTO stock_reservations (id, customer_id, order_id, status, expires_at)
       VALUES (:id, :customerId, :orderId, 'ACTIVE', :expiresAt)`,
      { replacements: { id: reservationId, customerId, orderId, expiresAt }, transaction: t }
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const item of normalizedItems) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(
        `INSERT INTO reservation_items (reservation_id, variant_id, quantity)
         VALUES (:reservationId, :variantId, :quantity)`,
        {
          replacements: {
            reservationId,
            variantId: item.variantId,
            quantity: item.quantity,
          },
          transaction: t,
        }
      );
    }

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  // Best-effort cache: a Redis failure must never undo a committed reservation
  try {
    await cacheService.set(
      `reservation:${reservationId}`,
      {
        reservationId,
        customerId,
        items: normalizedItems,
        expiresAt: expiresAt.toISOString(),
      },
      ttlSeconds
    );
  } catch (err) {
    logger.warn(`[RESERVATION] Redis write failed for ${reservationId}: ${err.message}`);
  }

  logger.info(`[RESERVATION] Reserved ${normalizedItems.length} item(s) as "${reservationId}"`);

  return {
    reservation_id: reservationId,
    order_id: orderId,
    expires_in: ttlSeconds,
    expires_at: expiresAt.toISOString(),
    items: normalizedItems,
  };
};

module.exports = { normalizeItems, reserveStock, RESERVATION_TTL_SECONDS };
