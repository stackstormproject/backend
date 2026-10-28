// ==============================================================================
// Admin order management: search, detail and status changes with business rules.
// Every status change runs in one transaction with the order row locked, so two staff
// members cannot apply conflicting changes at the same time.
// ==============================================================================

const { Op, QueryTypes } = require('sequelize');
const { Order, OrderItem, Customer, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const reservationService = require('./reservation.service');
const stripeService = require('./stripe.service');
const { generateInvoiceNumber, getOrderForAdmin } = require('./order.service');

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const INVOICE_PATTERN = /^DFC-\d{4}-(\d+)$/i;

/**
 * Allowed transitions. Collection orders (shipping_option "pickup") may go straight from
 * processing to delivered, which means "collected".
 */
const TRANSITIONS = {
  payment_pending: ['cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  return_requested: [],
  returned: [],
};
const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

const allowedNextStatuses = (order) => {
  const next = [...(TRANSITIONS[order.status] || [])];
  if (order.status === 'processing' && order.shippingOption === 'pickup') next.push('delivered');
  return next;
};

/** Search matches the customer-facing number (DFC-2026-0012), the id, email or name. */
const searchWhere = (search) => {
  const term = String(search || '').trim();
  if (!term) return null;
  const invoice = INVOICE_PATTERN.exec(term);
  const id = invoice ? Number(invoice[1]) : Number(term.replace(/^#/, ''));
  const like = { [Op.iLike]: `%${term}%` };
  return {
    [Op.or]: [
      ...(Number.isInteger(id) && id > 0 ? [{ id }] : []),
      { guestEmail: like },
      { '$customer.email$': like },
      { '$customer.name$': like },
    ],
  };
};

const listOrders = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const conditions = [];
  if (query.status) {
    if (!Object.keys(TRANSITIONS).includes(query.status)) {
      throw ApiError.badRequest(`Unknown status "${query.status}"`);
    }
    conditions.push({ status: query.status });
  }
  const search = searchWhere(query.search);
  if (search) conditions.push(search);

  const { count, rows } = await Order.findAndCountAll({
    where: conditions.length ? { [Op.and]: conditions } : {},
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: OrderItem, as: 'items', attributes: ['quantity'] },
    ],
    order: [['order_date', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
    subQuery: false,
  });

  return {
    orders: rows.map((order) => ({
      id: order.id,
      invoice_number: generateInvoiceNumber(order),
      customer_name: order.customer?.name || 'Guest',
      customer_email: order.customer?.email || order.guestEmail || '',
      is_guest: !order.customerId,
      status: order.status,
      shipping_option: order.shippingOption,
      items_count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      total_amount: Number(order.totalAmount || 0),
      order_date: order.orderDate,
      tracking_number: order.trackingNumber,
      // #181: lets the order list offer a status change without opening the order
      allowed_statuses: allowedNextStatuses(order),
    })),
    pagination: { total: count, page, limit, total_pages: Math.ceil(count / limit) || 1 },
  };
};

/** Order detail plus the statuses staff may move it to next. */
const getOrder = async (orderId) => {
  const view = await getOrderForAdmin(orderId);
  return {
    ...view,
    allowed_statuses: allowedNextStatuses({
      status: view.status,
      shippingOption: view.shipping_option,
    }),
  };
};

/** Puts the stock of a paid order back on sale, with an audit log line per variant. */
const restockOrder = async (order, adminId, transaction) => {
  const replacements = {
    orderId: order.id,
    adminId,
    reason: `Order ${generateInvoiceNumber(order)} cancelled`,
  };
  await sequelize.query(
    `UPDATE product_variants v
        SET stock_quantity = v.stock_quantity + oi.quantity, updated_at = NOW()
       FROM order_items oi
      WHERE oi.order_id = :orderId AND v.id = oi.product_variant_id`,
    { replacements, transaction }
  );
  await sequelize.query(
    `INSERT INTO inventory_logs (product_variant_id, admin_id, change_quantity, reason, created_at, updated_at)
     SELECT product_variant_id, :adminId, quantity, :reason, NOW(), NOW()
       FROM order_items WHERE order_id = :orderId`,
    { replacements, transaction }
  );
};

const activeReservationOf = async (orderId, transaction) => {
  const [row] = await sequelize.query(
    "SELECT id FROM stock_reservations WHERE order_id = :orderId AND status = 'ACTIVE'",
    { replacements: { orderId }, type: QueryTypes.SELECT, transaction }
  );
  return row ? row.id : null;
};

/**
 * Changes an order's status if the transition is allowed.
 * - shipped needs a tracking number (except collection orders)
 * - delivered records the delivery date (starts the 30-day return window)
 * - cancelling an unpaid order releases its stock hold; cancelling a paid order restocks
 *   the items and refunds the payment
 */
const updateStatus = async (orderId, { status, trackingNumber, adminId = null }) => {
  if (!status || !Object.keys(TRANSITIONS).includes(status)) {
    throw ApiError.badRequest(`Unknown status "${status}"`);
  }

  let refundTarget = null;
  let releaseId = null;
  const updated = await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!order) throw ApiError.notFound(`Order with ID '${orderId}' not found`);

    const allowed = allowedNextStatuses(order);
    if (!allowed.includes(status)) {
      throw ApiError.conflict(
        `An order that is "${order.status}" cannot become "${status}"${
          allowed.length ? ` (allowed: ${allowed.join(', ')})` : ''
        }`
      );
    }

    const updates = { status };
    const tracking = String(trackingNumber || '').trim();
    if (status === 'shipped') {
      if (!tracking && order.shippingOption !== 'pickup') {
        throw ApiError.badRequest('A courier tracking number is required to mark an order shipped');
      }
      if (tracking) updates.trackingNumber = tracking;
    }
    if (status === 'delivered') updates.deliveryDate = new Date();

    if (status === 'cancelled') {
      if (PAID_STATUSES.includes(order.status)) {
        await restockOrder(order, adminId, transaction);
        refundTarget = order;
      } else {
        releaseId = await activeReservationOf(order.id, transaction);
      }
    }

    await order.update(updates, { transaction });
    return order;
  });

  // Outside the transaction: external calls must not hold the order row lock.
  let refund = null;
  if (releaseId) {
    await reservationService.releaseReservation(releaseId).catch((err) => {
      logger.warn(`[ADMIN ORDER] Could not release ${releaseId}: ${err.message}`);
    });
  }
  if (refundTarget) {
    try {
      refund = await stripeService.refundOrderPayment(refundTarget);
    } catch (err) {
      logger.error(`[ADMIN ORDER] Refund failed for order ${orderId}: ${err.message}`);
      refund = { refunded: false, error: 'Refund failed: issue it from the Stripe dashboard' };
    }
  }

  logger.info(`[ADMIN ORDER] Order ${orderId} -> ${status} by admin ${adminId}`);
  return {
    id: updated.id,
    status: updated.status,
    tracking_number: updated.trackingNumber,
    delivery_date: updated.deliveryDate,
    refund,
    allowed_statuses: allowedNextStatuses(updated),
  };
};

module.exports = {
  TRANSITIONS,
  allowedNextStatuses,
  listOrders,
  getOrder,
  updateStatus,
};
