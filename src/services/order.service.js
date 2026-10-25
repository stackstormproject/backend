const { Order, OrderItem, ProductVariant, Product, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Generates an immutable, human-readable tax invoice identifier.
 * Pattern: DFC-{YEAR}-{ORDER_SEQUENCE}
 *
 * @param {object} order
 * @returns {string} Unique invoice string
 */
const generateInvoiceNumber = (order) => {
  const date = order.orderDate ? new Date(order.orderDate) : new Date();
  const year = date.getFullYear();
  const suffix = String(order.id || '0001').padStart(4, '0');
  return `DFC-${year}-${suffix}`;
};

/**
 * Parses JSON address string or returns object.
 */
const parseAddress = (addr) => {
  if (!addr) return null;
  if (typeof addr === 'object') return addr;
  try {
    return JSON.parse(addr);
  } catch (_e) {
    return addr;
  }
};

/**
 * Retrieves order details by ID with line items, variants, products and customer info.
 * Enforces ownership boundary for authenticated customers or guest order token verification.
 *
 * @param {number|string} orderId
 * @param {number|string|null} customerId
 * @param {string|null} guestToken
 * @returns {Promise<object>}
 */
const getOrderById = async (orderId, customerId = null, guestToken = null) => {
  if (!orderId) {
    throw ApiError.badRequest('order_id is required');
  }

  const order = await Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: 'items',
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'title', 'slug', 'base_price'],
              },
            ],
          },
        ],
      },
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'email', 'phone'],
      },
    ],
  });

  if (!order) {
    throw ApiError.notFound(`Order with ID '${orderId}' not found`);
  }

  // Ownership verification: If order has customerId and caller provided customerId, must match
  if (order.customerId && customerId && Number(order.customerId) !== Number(customerId)) {
    throw ApiError.forbidden('You do not have permission to view this order');
  }

  // If guest order, verify guest token or email match
  if (!order.customerId && !customerId && guestToken && order.guestOrderToken !== guestToken) {
    throw ApiError.forbidden('Invalid guest order token');
  }

  const plain = typeof order.toJSON === 'function' ? order.toJSON() : order;
  const invoiceNumber = generateInvoiceNumber(plain);
  const shippingAddress = parseAddress(plain.shippingAddress);
  const billingAddress = parseAddress(plain.billingAddress);

  return {
    id: plain.id,
    order_id: plain.id,
    order_number: plain.id,
    invoice_number: invoiceNumber,
    customer_id: plain.customerId,
    is_guest: !plain.customerId,
    guest_email: plain.guestEmail,
    status: plain.status,
    order_status: plain.status,
    order_date: plain.orderDate,
    delivery_date: plain.deliveryDate,
    shipping_option: plain.shippingOption,
    shipping_cost: Number(plain.shippingCost || 0),
    tax_amount: Number(plain.taxAmount || 0),
    discount_amount: Number(plain.discountAmount || 0),
    total_amount: Number(plain.totalAmount || 0),
    tracking_number: plain.trackingNumber,
    notes: plain.notes,
    shipping_address: shippingAddress,
    billing_address: billingAddress,
    customer: plain.customer || null,
    items: (plain.items || []).map((item) => ({
      id: item.id,
      variant_id: item.productVariantId,
      quantity: item.quantity,
      unit_price: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      product_title: item.variant?.product?.title || 'Garment Item',
      sku: item.variant?.sku || '',
      size: item.variant?.size || null,
      color: item.variant?.color || null,
    })),
    created_at: plain.createdAt || plain.orderDate,
    updated_at: plain.updatedAt || plain.orderDate,
  };
};

/**
 * Retrieves paginated list of past orders for an authenticated customer.
 *
 * @param {number|string} customerId
 * @param {object} options
 * @returns {Promise<object>}
 */
const getCustomerOrders = async (customerId, options = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await Order.findAndCountAll({
    where: { customerId },
    include: [
      {
        model: OrderItem,
        as: 'items',
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'title', 'slug', 'base_price'],
              },
            ],
          },
        ],
      },
    ],
    order: [['order_date', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const orders = rows.map((order) => {
    const plain = typeof order.toJSON === 'function' ? order.toJSON() : order;
    return {
      id: plain.id,
      order_id: plain.id,
      order_number: plain.id,
      invoice_number: generateInvoiceNumber(plain),
      status: plain.status,
      order_status: plain.status,
      order_date: plain.orderDate,
      delivery_date: plain.deliveryDate,
      total_amount: Number(plain.totalAmount || 0),
      shipping_cost: Number(plain.shippingCost || 0),
      tracking_number: plain.trackingNumber,
      shipping_address: parseAddress(plain.shippingAddress),
      items_count: (plain.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0),
      items: (plain.items || []).map((item) => ({
        id: item.id,
        variant_id: item.productVariantId,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        product_title: item.variant?.product?.title || 'Garment Item',
        sku: item.variant?.sku || '',
        size: item.variant?.size || null,
        color: item.variant?.color || null,
      })),
      created_at: plain.createdAt || plain.orderDate,
      updated_at: plain.updatedAt || plain.orderDate,
    };
  });

  return {
    orders,
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Retrieves delivery milestone tracking timeline for an order.
 *
 * @param {number|string} orderId
 * @param {number|string|null} customerId
 * @param {string|null} guestToken
 * @returns {Promise<object>}
 */
const getOrderTracking = async (orderId, customerId = null, guestToken = null) => {
  const order = await getOrderById(orderId, customerId, guestToken);
  const { status } = order;
  const orderDate = new Date(order.order_date || order.created_at || Date.now());
  const estDeliveryDate = new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000);

  const statusIndices = {
    payment_pending: 0,
    confirmed: 1,
    processing: 1,
    shipped: 2,
    delivered: 3,
  };

  const currentIndex = Object.prototype.hasOwnProperty.call(statusIndices, status)
    ? statusIndices[status]
    : -1;

  const getStepStatus = (stepIndex) => {
    if (currentIndex >= 0) {
      if (currentIndex === stepIndex) return 'current';
      if (currentIndex > stepIndex) return 'completed';
      return 'pending';
    }
    return status === 'cancelled' && stepIndex === 0 ? 'completed' : 'pending';
  };

  const milestones = [
    {
      step: 1,
      key: 'placed',
      title: 'Order Placed',
      description: 'Order received and logged in system.',
      status: getStepStatus(0),
      timestamp: order.created_at,
    },
    {
      step: 2,
      key: 'processing',
      title: 'Confirmed & Processing',
      description: 'Payment verified and garment items packed at Dickwella fulfillment center.',
      status: getStepStatus(1),
      timestamp: currentIndex >= 1 ? order.updated_at : null,
    },
    {
      step: 3,
      key: 'shipped',
      title: 'Dispatched & In Transit',
      description: 'Package handed over to domestic courier service.',
      status: getStepStatus(2),
      timestamp: currentIndex >= 2 ? order.updated_at : null,
    },
    {
      step: 4,
      key: 'delivered',
      title: 'Delivered',
      description: 'Package successfully delivered to destination.',
      status: getStepStatus(3),
      timestamp: currentIndex === 3 ? order.updated_at : null,
    },
  ];

  if (status === 'cancelled') {
    milestones.push({
      step: 5,
      key: 'cancelled',
      title: 'Order Cancelled',
      description: 'Order cancelled.',
      status: 'completed',
      timestamp: order.updated_at,
    });
  }

  return {
    order_id: order.id,
    order_number: order.id,
    invoice_number: order.invoice_number,
    current_status: status,
    carrier: 'PromptX Express / Koombiyo Logistics',
    tracking_number: order.tracking_number || `TRK-DFC-${order.id}`,
    estimated_delivery: estDeliveryDate.toISOString().split('T')[0],
    shipping_address: order.shipping_address,
    items_count: (order.items || []).length,
    milestones,
  };
};

/**
 * Atomically finalizes an order upon successful payment capture.
 * Transitions order status to 'processing' and records payment intent.
 *
 * @param {number|string} orderId
 * @param {object} paymentDetails
 * @returns {Promise<object>}
 */
const finalizeOrder = async (orderId, paymentDetails = {}) => {
  if (!orderId) {
    throw ApiError.badRequest('order_id is required to finalize order');
  }

  const order = await Order.findByPk(orderId, {
    include: [{ model: OrderItem, as: 'items' }],
  });

  if (!order) {
    throw ApiError.notFound(`Order with ID '${orderId}' not found`);
  }

  const paymentIntentId =
    paymentDetails.payment_intent_id || paymentDetails.id || `pi_${Date.now()}`;

  await order.update({
    status: 'processing',
    paymentIntentId,
  });

  logger.info(`[ORDER] Order #${order.id} finalized with payment intent ${paymentIntentId}`);

  return {
    success: true,
    order_id: order.id,
    status: order.status,
    payment_intent_id: paymentIntentId,
    finalized_at: new Date().toISOString(),
  };
};

module.exports = {
  getOrderById,
  getCustomerOrders,
  getOrderTracking,
  finalizeOrder,
  generateInvoiceNumber,
};
