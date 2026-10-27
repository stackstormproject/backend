// ==============================================================================
// Customer records for shop managers (FR024 searchable customer database, FR027 loyalty).
// Spending counts paid orders only. Point corrections are row-locked, can never make a
// balance negative, and are logged with the admin and a reason.
// ==============================================================================

const { QueryTypes } = require('sequelize');
const { Loyalty, LoyaltyTransaction, Customer, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { generateInvoiceNumber } = require('./order.service');

const PAID = "('confirmed','processing','shipped','delivered')";
const SORTS = {
  newest: 'c.created_at DESC',
  spend: 'total_spent DESC, c.created_at DESC',
  orders: 'order_count DESC, c.created_at DESC',
  name: 'c.name ASC',
};
const TIERS = ['silver', 'gold', 'platinum'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_ADJUSTMENT = 100000;
const NOTE_MAX = 200;

const SUMMARY = `
  SELECT c.id, c.name, c.email, c.phone, c.created_at,
         COALESCE(l.tier::text, c.loyalty_tier::text, 'silver') AS tier,
         COALESCE(l.current_points, 0) AS points,
         COUNT(o.id) FILTER (WHERE o.status IN ${PAID})::int AS order_count,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status IN ${PAID}), 0)::float AS total_spent,
         MAX(o.order_date) FILTER (WHERE o.status IN ${PAID}) AS last_order_at
    FROM customers c
    LEFT JOIN loyalties l ON l.customer_id = c.id
    LEFT JOIN orders o ON o.customer_id = c.id`;

const toSummary = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  registered_at: row.created_at,
  tier: row.tier,
  points: row.points,
  order_count: row.order_count,
  total_spent: Number(row.total_spent),
  last_order_at: row.last_order_at,
});

/** Search by name, email or phone; filter by tier; sort by newest, spend, orders or name. */
const listCustomers = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const search = String(query.search || '').trim();
  const tier = TIERS.includes(query.tier) ? query.tier : null;
  const where = [
    'c.deleted_at IS NULL',
    search ? '(c.name ILIKE :like OR c.email ILIKE :like OR c.phone ILIKE :like)' : null,
    tier ? 'COALESCE(l.tier::text, c.loyalty_tier::text) = :tier' : null,
  ]
    .filter(Boolean)
    .join(' AND ');
  const replacements = { like: `%${search}%`, tier, limit, offset: (page - 1) * limit };

  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(
      `${SUMMARY} WHERE ${where} GROUP BY c.id, l.customer_id
        ORDER BY ${SORTS[query.sort] || SORTS.newest} LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS total FROM customers c LEFT JOIN loyalties l ON l.customer_id = c.id
        WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);
  return {
    customers: rows.map(toSummary),
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) || 1 },
  };
};

const getCustomer = async (id) => {
  const [row] = await sequelize.query(
    `${SUMMARY} WHERE c.id = :id AND c.deleted_at IS NULL GROUP BY c.id, l.customer_id`,
    {
      replacements: { id },
      type: QueryTypes.SELECT,
    }
  );
  if (!row) throw ApiError.notFound(`Customer ${id} not found`);

  const [orders, addresses, transactions] = await Promise.all([
    sequelize.query(
      `SELECT id, order_date, status, total_amount FROM orders
        WHERE customer_id = :id ORDER BY order_date DESC LIMIT 10`,
      { replacements: { id }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT id, address_line1, address_line2, city, state, postal_code, is_default FROM addresses
        WHERE customer_id = :id ORDER BY is_default DESC, id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT t.id, t.points, t.transaction_type, t.description, t.created_at, a.name AS admin_name
         FROM loyalty_transactions t LEFT JOIN admins a ON a.id = t.admin_id
        WHERE t.customer_id = :id ORDER BY t.created_at DESC, t.id DESC LIMIT 20`,
      { replacements: { id }, type: QueryTypes.SELECT }
    ),
  ]);

  return {
    ...toSummary(row),
    recent_orders: orders.map((o) => ({
      id: o.id,
      invoice_number: generateInvoiceNumber({ id: o.id, orderDate: o.order_date }),
      order_date: o.order_date,
      status: o.status,
      total_amount: Number(o.total_amount),
    })),
    addresses,
    loyalty_transactions: transactions,
  };
};

/** Adds or removes points with a reason; never below zero. */
const adjustPoints = async (customerId, { points, note }, adminId) => {
  const change = Number(points);
  if (!Number.isInteger(change) || change === 0 || Math.abs(change) > MAX_ADJUSTMENT) {
    throw ApiError.badRequest(
      `Points must be a whole number between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}, not 0`
    );
  }
  const reason = String(note || '')
    .trim()
    .slice(0, NOTE_MAX);
  if (!reason)
    throw ApiError.badRequest('Give a reason; the customer sees it in their points history');

  await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findByPk(customerId, { transaction });
    if (!customer) throw ApiError.notFound(`Customer ${customerId} not found`);
    let account = await Loyalty.findOne({
      where: { customerId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!account) {
      account = await Loyalty.create(
        {
          customerId,
          currentPoints: 0,
          lifetimePoints: 0,
          tier: 'silver',
          tierStartDate: new Date(),
        },
        { transaction }
      );
    }
    const balance = account.currentPoints + change;
    if (balance < 0) {
      throw ApiError.conflict(`Only ${account.currentPoints} points available to remove`);
    }
    await account.update(
      {
        currentPoints: balance,
        lifetimePoints: change > 0 ? account.lifetimePoints + change : account.lifetimePoints,
      },
      { transaction }
    );
    await LoyaltyTransaction.create(
      { customerId, points: change, transactionType: 'adjusted', description: reason, adminId },
      { transaction }
    );
    await customer.update({ loyaltyPoints: balance }, { transaction });
  });
  return getCustomer(customerId);
};

module.exports = { listCustomers, getCustomer, adjustPoints };
