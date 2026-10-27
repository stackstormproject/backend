// ==============================================================================
// Returns and exchanges for shop managers (FR023, UC-005).
//   requested --approve--> approved --receive(acceptable)-----> completed
//            \--reject--> rejected  \--receive(not acceptable)-> rejected
// Receiving an acceptable item puts it back in stock; a return is refunded to the original
// payment, an exchange takes the new size out of stock. Each step runs with the return row
// locked, so two staff members cannot resolve the same return twice.
// ==============================================================================

const { QueryTypes } = require('sequelize');
const { Return, Order, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { refundOrderPayment } = require('./stripe.service');
const { generateInvoiceNumber } = require('./order.service');

const STATUSES = ['requested', 'approved', 'rejected', 'completed'];
const NOTE_MAX = 500;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const cleanNote = (note) =>
  String(note || '')
    .trim()
    .slice(0, NOTE_MAX) || null;

const RETURN_SELECT = `
  SELECT r.id, r.type, r.status, r.reason, r.refund_amount, r.admin_note, r.created_at,
         r.resolved_at, r.order_item_id, r.exchange_variant_id,
         o.id AS order_id, o.order_date, o.delivery_date, o.customer_id,
         c.name AS customer_name, c.email AS customer_email,
         oi.quantity, oi.unit_price, oi.subtotal, oi.product_variant_id,
         v.sku, v.size, v.color, p.name AS product_name, p.slug AS product_slug,
         ev.size AS exchange_size, ev.color AS exchange_color,
         ev.stock_quantity - ev.reserved_quantity AS exchange_available,
         a.name AS resolved_by_name
    FROM returns r
    JOIN orders o ON o.id = r.order_id
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN product_variants v ON v.id = oi.product_variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN product_variants ev ON ev.id = r.exchange_variant_id
    LEFT JOIN admins a ON a.id = r.resolved_by`;

const toView = (row) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  reason: row.reason,
  admin_note: row.admin_note,
  refund_amount: Number(row.refund_amount || 0),
  created_at: row.created_at,
  resolved_at: row.resolved_at,
  resolved_by: row.resolved_by_name,
  order: {
    id: row.order_id,
    invoice_number: generateInvoiceNumber({ id: row.order_id, orderDate: row.order_date }),
    delivery_date: row.delivery_date,
  },
  customer: { id: row.customer_id, name: row.customer_name, email: row.customer_email },
  item: {
    id: row.order_item_id,
    variant_id: row.product_variant_id,
    product_name: row.product_name,
    product_slug: row.product_slug,
    sku: row.sku,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    subtotal: Number(row.subtotal),
  },
  exchange:
    row.type === 'exchange'
      ? {
          variant_id: row.exchange_variant_id,
          size: row.exchange_size,
          color: row.exchange_color,
          available: row.exchange_available,
        }
      : null,
});

const listReturns = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const status = STATUSES.includes(query.status) ? query.status : null;
  const where = status ? 'WHERE r.status = :status' : '';
  const replacements = { status, limit, offset: (page - 1) * limit };
  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(
      `${RETURN_SELECT} ${where}
        ORDER BY CASE r.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                 r.created_at DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(`SELECT COUNT(*)::int AS total FROM returns r ${where}`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);
  return {
    returns: rows.map(toView),
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) || 1 },
  };
};

const getReturn = async (id, transaction) => {
  const [row] = await sequelize.query(`${RETURN_SELECT} WHERE r.id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  if (!row) throw ApiError.notFound(`Return ${id} not found`);
  return toView(row);
};

/** Locks the return row and checks it is in one of the expected statuses. */
const lockReturn = async (id, expected, transaction) => {
  const record = await Return.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!record) throw ApiError.notFound(`Return ${id} not found`);
  if (!expected.includes(record.status)) {
    throw ApiError.conflict(`Return ${id} is already ${record.status}`);
  }
  return record;
};

const resolve = (record, status, adminId, note, transaction) =>
  record.update(
    {
      status,
      adminNote: cleanNote(note) ?? record.adminNote,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    },
    { transaction }
  );

const approveReturn = async (id, adminId, note) => {
  await sequelize.transaction(async (transaction) => {
    const record = await lockReturn(id, ['requested'], transaction);
    await record.update(
      { status: 'approved', adminNote: cleanNote(note), resolvedBy: adminId },
      { transaction }
    );
  });
  return getReturn(id);
};

const rejectReturn = async (id, adminId, note) => {
  if (!cleanNote(note)) throw ApiError.badRequest('Tell the customer why the request was rejected');
  await sequelize.transaction(async (transaction) => {
    const record = await lockReturn(id, ['requested', 'approved'], transaction);
    await resolve(record, 'rejected', adminId, note, transaction);
  });
  return getReturn(id);
};

const moveStock = (variantId, change, adminId, reason, transaction) =>
  Promise.all([
    sequelize.query(
      'UPDATE product_variants SET stock_quantity = stock_quantity + :change, updated_at = NOW() WHERE id = :variantId',
      { replacements: { variantId, change }, transaction }
    ),
    sequelize.query(
      `INSERT INTO inventory_logs (product_variant_id, admin_id, change_quantity, reason, created_at, updated_at)
       VALUES (:variantId, :adminId, :change, :reason, NOW(), NOW())`,
      { replacements: { variantId, adminId, change, reason }, transaction }
    ),
  ]);

/**
 * The returned item has arrived and been inspected.
 * acceptable=false rejects the return (the item goes back to the customer).
 */
const receiveReturn = async (id, adminId, { acceptable, note } = {}) => {
  if (typeof acceptable !== 'boolean') {
    throw ApiError.badRequest('Say whether the item came back in acceptable condition');
  }
  if (!acceptable && !cleanNote(note)) {
    throw ApiError.badRequest('Describe the condition so the customer knows why');
  }

  let refund = null;
  await sequelize.transaction(async (transaction) => {
    const record = await lockReturn(id, ['approved'], transaction);
    if (!acceptable) {
      await resolve(record, 'rejected', adminId, note, transaction);
      return;
    }
    const view = await getReturn(id, transaction);
    const label = `Return ${id} for ${view.order.invoice_number}`;
    await moveStock(
      view.item.variant_id,
      view.item.quantity,
      adminId,
      `${label} received`,
      transaction
    );

    if (record.type === 'exchange') {
      const [replacement] = await sequelize.query(
        'SELECT stock_quantity - reserved_quantity AS available FROM product_variants WHERE id = :id FOR UPDATE',
        { replacements: { id: record.exchangeVariantId }, type: QueryTypes.SELECT, transaction }
      );
      if (!replacement || replacement.available < view.item.quantity) {
        throw ApiError.conflict(
          'The replacement size is out of stock. Restock it or refund instead.'
        );
      }
      await moveStock(
        record.exchangeVariantId,
        -view.item.quantity,
        adminId,
        `${label} replacement sent`,
        transaction
      );
    } else {
      const order = await Order.findByPk(view.order.id, { transaction });
      // Inside the transaction: if anything after this fails, the retry reuses the same
      // idempotency key and Stripe returns the same refund instead of paying twice.
      refund = await refundOrderPayment(order, record.refundAmount, `return-${record.id}`);
    }
    await resolve(record, 'completed', adminId, note, transaction);
  });

  return { ...(await getReturn(id)), refund };
};

module.exports = { STATUSES, listReturns, getReturn, approveReturn, rejectReturn, receiveReturn };
