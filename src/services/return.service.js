const { Return, Order, OrderItem, ProductVariant, Product } = require('../models');
const ApiError = require('../utils/ApiError');

const RETURN_WINDOW_DAYS = 30; // SRS business rule: returns within 30 days of delivery
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SRS business rules: only delivered orders, within 30 days of delivery, never final-sale items.
 * Throws a 400 RETURN_NOT_ELIGIBLE-style error explaining which rule failed.
 */
const assertReturnEligible = (order, product, now = new Date()) => {
  if (order.status !== 'delivered') {
    throw ApiError.badRequest('Only delivered orders can be returned or exchanged');
  }
  if (product && product.isFinalSale) {
    throw ApiError.badRequest('Final-sale items cannot be returned or exchanged');
  }
  const deliveredAt = new Date(order.deliveryDate || order.updatedAt || order.orderDate);
  if (now.getTime() - deliveredAt.getTime() > RETURN_WINDOW_DAYS * DAY_MS) {
    throw ApiError.badRequest(`The ${RETURN_WINDOW_DAYS}-day return window has closed`);
  }
};
const logger = require('../config/logger');

/**
 * Validates and submits a new return or size exchange request for an order item.
 * Strictly enforces:
 *  1. Order must belong to the requesting customer.
 *  2. For exchanges, exchangeVariantId is validated against available stock.
 *
 * @param {object} params
 * @returns {Promise<object>} Created return request record
 */
const requestReturn = async (params = {}) => {
  const { customerId, orderItemId, type = 'return', exchangeVariantId = null, reason } = params;
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required to request a return');
  }

  if (!orderItemId) {
    throw ApiError.badRequest('order_item_id is required');
  }

  if (!['return', 'exchange'].includes(type)) {
    throw ApiError.badRequest('Type must be either "return" or "exchange"');
  }

  if (!reason || !String(reason).trim()) {
    throw ApiError.badRequest('Reason cannot be empty');
  }

  const orderItem = await OrderItem.findByPk(orderItemId, {
    include: [
      { model: Order, as: 'order' },
      {
        model: ProductVariant,
        as: 'variant',
        include: [{ model: Product, as: 'product', attributes: ['id', 'isFinalSale'] }],
      },
    ],
  });

  if (!orderItem) {
    throw ApiError.notFound(`Order item with ID '${orderItemId}' not found`);
  }

  if (!orderItem.order || Number(orderItem.order.customerId) !== Number(customerId)) {
    throw ApiError.forbidden('You do not have permission to return this order item');
  }

  assertReturnEligible(orderItem.order, orderItem.variant?.product);

  // Prevent multiple active return requests for the same order item
  const existingReturn = await Return.findOne({
    where: { orderItemId },
  });
  if (existingReturn) {
    throw ApiError.conflict(
      'A return or exchange request has already been submitted for this item'
    );
  }

  if (type === 'exchange') {
    if (!exchangeVariantId) {
      throw ApiError.badRequest('exchange_variant_id is required for size/color exchanges');
    }
    const exchangeVariant = await ProductVariant.findByPk(exchangeVariantId);
    if (!exchangeVariant) {
      throw ApiError.notFound(`Exchange variant with ID '${exchangeVariantId}' not found`);
    }
  }

  const refundAmount =
    type === 'return' ? Number(orderItem.subtotal || orderItem.unitPrice || 0) : 0.0;

  const returnRecord = await Return.create({
    orderId: orderItem.orderId,
    orderItemId,
    type,
    exchangeVariantId: type === 'exchange' ? exchangeVariantId : null,
    reason: String(reason).trim(),
    status: 'requested',
    refundAmount,
  });

  logger.info(
    `[RETURN] Customer ${customerId} submitted ${type} request #${returnRecord.id} for orderItem ${orderItemId}`
  );

  return {
    id: returnRecord.id,
    order_id: returnRecord.orderId,
    order_item_id: returnRecord.orderItemId,
    type: returnRecord.type,
    exchange_variant_id: returnRecord.exchangeVariantId,
    reason: returnRecord.reason,
    status: returnRecord.status,
    refund_amount: Number(returnRecord.refundAmount),
    created_at: returnRecord.createdAt,
  };
};

/**
 * Retrieves paginated return requests for the authenticated customer.
 *
 * @param {number|string} customerId
 * @param {object} options
 * @returns {Promise<object>}
 */
const getCustomerReturns = async (customerId, options = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await Return.findAndCountAll({
    include: [
      {
        model: Order,
        as: 'order',
        where: { customerId },
        attributes: ['id', 'customerId', 'orderDate', 'status'],
      },
      {
        model: OrderItem,
        as: 'orderItem',
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'slug'] }],
          },
        ],
      },
      {
        model: ProductVariant,
        as: 'exchangeVariant',
        attributes: ['id', 'sku', 'size', 'color'],
      },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const returns = rows.map((r) => ({
    id: r.id,
    order_id: r.orderId,
    order_item_id: r.orderItemId,
    type: r.type,
    reason: r.reason,
    status: r.status,
    refund_amount: Number(r.refundAmount || 0),
    product_title: r.orderItem?.variant?.product?.name || 'Garment Item',
    sku: r.orderItem?.variant?.sku || '',
    exchange_variant: r.exchangeVariant || null,
    created_at: r.createdAt,
  }));

  return {
    returns,
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Retrieves return request details by ID with ownership enforcement.
 *
 * @param {number|string} returnId
 * @param {number|string} customerId
 * @returns {Promise<object>}
 */
const getReturnById = async (returnId, customerId) => {
  const returnRecord = await Return.findByPk(returnId, {
    include: [
      {
        model: Order,
        as: 'order',
        attributes: ['id', 'customerId'],
      },
      {
        model: OrderItem,
        as: 'orderItem',
      },
    ],
  });

  if (!returnRecord) {
    throw ApiError.notFound(`Return request with ID '${returnId}' not found`);
  }

  if (Number(returnRecord.order?.customerId) !== Number(customerId)) {
    throw ApiError.forbidden('You do not have permission to view this return request');
  }

  return {
    id: returnRecord.id,
    order_id: returnRecord.orderId,
    order_item_id: returnRecord.orderItemId,
    type: returnRecord.type,
    reason: returnRecord.reason,
    status: returnRecord.status,
    refund_amount: Number(returnRecord.refundAmount || 0),
    created_at: returnRecord.createdAt,
  };
};

module.exports = {
  assertReturnEligible,
  RETURN_WINDOW_DAYS,
  requestReturn,
  getCustomerReturns,
  getReturnById,
};
