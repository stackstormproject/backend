// ==============================================================================
// Inventory management for staff (FR017, FR018, UC-006).
// Every stock change is made under a row lock and written to inventory_logs with the admin
// who made it. Stock can never drop below the units held in active checkouts (ADR-004).
// ==============================================================================

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { LOW_STOCK_THRESHOLD } = require('./analytics.service');

const ADJUSTMENT_REASONS = [
  'restock',
  'damaged',
  'stock count correction',
  'returned to supplier',
  'other',
];
const MAX_ADJUSTMENT = 10000;
const MAX_NOTE = 200;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

const toItem = (row) => ({
  variant_id: row.variant_id,
  product_id: row.product_id,
  product_name: row.product_name,
  sku: row.sku,
  size: row.size,
  color: row.color,
  stock_quantity: row.stock_quantity,
  reserved_quantity: row.reserved_quantity,
  available: row.stock_quantity - row.reserved_quantity,
  is_low: row.stock_quantity - row.reserved_quantity <= LOW_STOCK_THRESHOLD,
});

/** Variants with stock levels; `low=true` keeps only low-stock rows, lowest first. */
const listInventory = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const lowOnly = query.low === 'true' || query.low === true;
  const search = String(query.search || '').trim();
  const where = [
    search ? '(p.name ILIKE :like OR v.sku ILIKE :like)' : null,
    lowOnly ? 'v.stock_quantity - v.reserved_quantity <= :threshold' : null,
  ].filter(Boolean);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const replacements = {
    like: `%${search}%`,
    threshold: LOW_STOCK_THRESHOLD,
    limit,
    offset: (page - 1) * limit,
  };

  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(
      `SELECT v.id AS variant_id, p.id AS product_id, p.name AS product_name, v.sku, v.size, v.color,
              v.stock_quantity, v.reserved_quantity
         FROM product_variants v JOIN products p ON p.id = v.product_id
         ${whereSql}
        ORDER BY ${lowOnly ? 'v.stock_quantity - v.reserved_quantity ASC,' : ''} p.name, v.sku
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS total
         FROM product_variants v JOIN products p ON p.id = v.product_id ${whereSql}`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);

  return {
    items: rows.map(toItem),
    low_stock_threshold: LOW_STOCK_THRESHOLD,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) || 1 },
  };
};

/**
 * Adds (positive delta) or removes (negative delta) stock for one variant.
 * @returns the updated variant row
 */
const adjustStock = async (variantId, { delta, reason, note, adminId }) => {
  const change = Number(delta);
  if (!Number.isInteger(change) || change === 0 || Math.abs(change) > MAX_ADJUSTMENT) {
    throw ApiError.badRequest(
      `Change must be a whole number between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}, not 0`
    );
  }
  if (!ADJUSTMENT_REASONS.includes(reason)) {
    throw ApiError.badRequest(`Reason must be one of: ${ADJUSTMENT_REASONS.join(', ')}`);
  }
  const cleanNote = String(note || '')
    .trim()
    .slice(0, MAX_NOTE);
  if (reason === 'other' && !cleanNote) {
    throw ApiError.badRequest('Add a note explaining an "other" adjustment');
  }

  return sequelize.transaction(async (transaction) => {
    const [variant] = await sequelize.query(
      `SELECT v.id AS variant_id, p.id AS product_id, p.name AS product_name, v.sku, v.size, v.color,
              v.stock_quantity, v.reserved_quantity
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = :id FOR UPDATE OF v`,
      { replacements: { id: variantId }, type: QueryTypes.SELECT, transaction }
    );
    if (!variant) throw ApiError.notFound(`Variant ${variantId} not found`);

    const next = variant.stock_quantity + change;
    if (next < variant.reserved_quantity) {
      throw ApiError.conflict(
        `Stock cannot go below ${variant.reserved_quantity}: that many are held in active checkouts`
      );
    }

    await sequelize.query(
      'UPDATE product_variants SET stock_quantity = :next, updated_at = NOW() WHERE id = :id',
      { replacements: { next, id: variantId }, transaction }
    );
    await sequelize.query(
      `INSERT INTO inventory_logs (product_variant_id, admin_id, change_quantity, reason, created_at, updated_at)
       VALUES (:id, :adminId, :change, :reason, NOW(), NOW())`,
      {
        replacements: {
          id: variantId,
          adminId,
          change,
          reason: cleanNote ? `${reason}: ${cleanNote}` : reason,
        },
        transaction,
      }
    );
    return toItem({ ...variant, stock_quantity: next });
  });
};

/** Change history for one variant, newest first, with the admin's name. */
const listLogs = async (variantId, limit = 50) =>
  sequelize.query(
    `SELECT l.id, l.change_quantity, l.reason, l.created_at, a.name AS admin_name
       FROM inventory_logs l LEFT JOIN admins a ON a.id = l.admin_id
      WHERE l.product_variant_id = :id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT :limit`,
    {
      replacements: { id: variantId, limit: Math.min(200, Number(limit) || 50) },
      type: QueryTypes.SELECT,
    }
  );

module.exports = { ADJUSTMENT_REASONS, listInventory, adjustStock, listLogs };
