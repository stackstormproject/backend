// ==============================================================================
// Admin dashboard analytics (FR028, FR029).
// All figures are computed in PostgreSQL with aggregates, so the cost does not grow with
// the number of orders loaded into memory (NFR015). Revenue counts paid orders only.
// ==============================================================================

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { generateInvoiceNumber } = require('./order.service');

const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];
const LOW_STOCK_THRESHOLD = 5;
const TOP_PRODUCT_COUNT = 5;
const RECENT_ORDER_COUNT = 5;
const MAX_TREND_DAYS = 365;
const DEFAULT_TREND_DAYS = 30;

const formatLKR = (amount) => {
  const num = Number(amount) || 0;
  return `LKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const one = async (sql, replacements = {}) => {
  const [row] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return row;
};

const getAnalyticsOverview = async () => {
  const paid = { paid: PAID_STATUSES };
  const [sales, pending, customers, returns, lowStock, support, topProducts, recent] =
    await Promise.all([
      one(
        `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0)::float AS revenue
           FROM orders WHERE status IN (:paid)`,
        paid
      ),
      one(`SELECT COUNT(*)::int AS count FROM orders WHERE status = 'payment_pending'`),
      one('SELECT COUNT(*)::int AS count FROM customers WHERE deleted_at IS NULL'),
      one(`SELECT COUNT(*)::int AS open, (SELECT COUNT(*) FROM returns)::int AS total
             FROM returns WHERE status IN ('requested', 'approved')`),
      one(
        `SELECT COUNT(*)::int AS count FROM product_variants
          WHERE stock_quantity - reserved_quantity <= :threshold`,
        { threshold: LOW_STOCK_THRESHOLD }
      ),
      one(`SELECT COUNT(*)::int AS count FROM chat_sessions WHERE status IN ('open', 'waiting')`),
      sequelize.query(
        `SELECT p.id, p.name, SUM(oi.quantity)::int AS units, SUM(oi.subtotal)::float AS revenue
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id AND o.status IN (:paid)
           JOIN product_variants v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
          GROUP BY p.id, p.name
          ORDER BY revenue DESC
          LIMIT :limit`,
        { replacements: { ...paid, limit: TOP_PRODUCT_COUNT }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT o.id, o.status, o.total_amount::float AS total_amount, o.order_date,
                COALESCE(c.name, 'Guest') AS customer_name
           FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
          ORDER BY o.order_date DESC LIMIT :limit`,
        { replacements: { limit: RECENT_ORDER_COUNT }, type: QueryTypes.SELECT }
      ),
    ]);

  const aov = sales.orders > 0 ? Math.round((sales.revenue / sales.orders) * 100) / 100 : 0;
  const returnRate = sales.orders > 0 ? Math.round((returns.total / sales.orders) * 1000) / 10 : 0;

  return {
    metrics: {
      total_revenue: Number(sales.revenue.toFixed(2)),
      formatted_revenue: formatLKR(sales.revenue),
      paid_orders: sales.orders,
      awaiting_payment: pending.count,
      active_customers: customers.count,
      average_order_value: aov,
      formatted_aov: formatLKR(aov),
      return_rate_percentage: returnRate,
      open_returns: returns.open,
      low_stock_count: lowStock.count,
      low_stock_threshold: LOW_STOCK_THRESHOLD,
      support_queue_count: support.count,
    },
    top_products: topProducts.map((p) => ({
      product_id: p.id,
      title: p.name,
      units_sold: p.units,
      revenue: Number(p.revenue.toFixed(2)),
    })),
    recent_orders: recent.map((o) => ({
      id: o.id,
      invoice_number: generateInvoiceNumber({ id: o.id, orderDate: o.order_date }),
      customer_name: o.customer_name,
      status: o.status,
      total_amount: o.total_amount,
      order_date: o.order_date,
    })),
  };
};

/**
 * Paid revenue and order count per day for the last `days` days (today included), with
 * zero-filled days so charts have no gaps. Dates are Sri Lanka calendar days.
 */
const getSalesTrend = async (days = DEFAULT_TREND_DAYS) => {
  const span = Math.min(MAX_TREND_DAYS, Math.max(1, parseInt(days, 10) || DEFAULT_TREND_DAYS));
  const rows = await sequelize.query(
    `WITH series AS (
       SELECT generate_series(
         (timezone('Asia/Colombo', NOW()))::date - (:span - 1),
         (timezone('Asia/Colombo', NOW()))::date,
         interval '1 day')::date AS day
     )
     SELECT to_char(s.day, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(o.total_amount), 0)::float AS revenue,
            COUNT(o.id)::int AS orders
       FROM series s
       LEFT JOIN orders o
         ON (timezone('Asia/Colombo', o.order_date))::date = s.day AND o.status IN (:paid)
      GROUP BY s.day
      ORDER BY s.day`,
    { replacements: { span, paid: PAID_STATUSES }, type: QueryTypes.SELECT }
  );
  const totals = rows.reduce(
    (acc, row) => ({ revenue: acc.revenue + row.revenue, orders: acc.orders + row.orders }),
    { revenue: 0, orders: 0 }
  );
  return {
    days: span,
    series: rows,
    totals: { ...totals, revenue: Number(totals.revenue.toFixed(2)) },
  };
};

module.exports = {
  formatLKR,
  getAnalyticsOverview,
  getSalesTrend,
  PAID_STATUSES,
  LOW_STOCK_THRESHOLD,
};
