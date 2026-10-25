const { Order, OrderItem, ProductVariant, Product, Customer, Return } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Formats an amount into standard Sri Lankan Rupee display string.
 *
 * @param {number} amount
 * @returns {string} e.g. "LKR 145,000.00"
 */
const formatLKR = (amount) => {
  const num = Number(amount) || 0;
  return `LKR ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Retrieves platform overview analytics metrics for admin dashboard.
 *
 * @returns {Promise<object>}
 */
const getAnalyticsOverview = async () => {
  const [orders, customersCount, returnsCount] = await Promise.all([
    Order.findAll({
      attributes: ['id', 'status', 'totalAmount', 'orderDate'],
      include: [
        {
          model: OrderItem,
          as: 'items',
          attributes: ['id', 'quantity', 'unitPrice', 'subtotal'],
          include: [
            {
              model: ProductVariant,
              as: 'variant',
              attributes: ['id', 'sku'],
              include: [{ model: Product, as: 'product', attributes: ['id', 'title'] }],
            },
          ],
        },
      ],
      order: [['order_date', 'DESC']],
    }),
    Customer.count(),
    Return.count(),
  ]);

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const grossRevenue = validOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const totalOrders = orders.length;
  const aov = totalOrders > 0 ? Math.round((grossRevenue / totalOrders) * 100) / 100 : 0;
  const returnRate = totalOrders > 0 ? Math.round((returnsCount / totalOrders) * 1000) / 10 : 0.0;

  // Compute product sales volume
  const productVolume = new Map();
  orders.forEach((o) => {
    (o.items || []).forEach((item) => {
      const prodTitle = item.variant?.product?.title || 'Unknown Product';
      const existing = productVolume.get(prodTitle) || { title: prodTitle, units: 0, revenue: 0 };
      existing.units += item.quantity || 1;
      existing.revenue += Number(item.subtotal || (item.unitPrice || 0) * (item.quantity || 1));
      productVolume.set(prodTitle, existing);
    });
  });

  const topProducts = Array.from(productVolume.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      units_sold: p.units,
      revenue: Number(p.revenue.toFixed(2)),
      formatted_revenue: formatLKR(p.revenue),
    }));

  return {
    metrics: {
      total_revenue: Number(grossRevenue.toFixed(2)),
      formatted_revenue: formatLKR(grossRevenue),
      total_orders: totalOrders,
      active_customers: customersCount,
      average_order_value: aov,
      formatted_aov: formatLKR(aov),
      return_rate_percentage: returnRate,
      returns_count: returnsCount,
    },
    top_products: topProducts,
    recent_orders: orders.slice(0, 5).map((o) => ({
      id: o.id,
      status: o.status,
      total_amount: Number(o.totalAmount || 0),
      formatted_total: formatLKR(o.totalAmount || 0),
      order_date: o.orderDate,
    })),
  };
};

/**
 * Retrieves all platform orders with optional status filter for back-office management.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
const getAllOrders = async (options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {};
  if (options.status) {
    where.status = options.status;
  }

  const { count, rows } = await Order.findAndCountAll({
    where,
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'email'],
      },
    ],
    order: [['order_date', 'DESC']],
    limit,
    offset,
  });

  return {
    orders: rows.map((o) => ({
      id: o.id,
      customer_id: o.customerId,
      customer_name: o.customer?.name || o.guestEmail || 'Guest Customer',
      status: o.status,
      total_amount: Number(o.totalAmount || 0),
      formatted_total: formatLKR(o.totalAmount || 0),
      order_date: o.orderDate,
    })),
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Updates order status by admin (e.g. 'processing' -> 'shipped' -> 'delivered').
 *
 * @param {number|string} orderId
 * @param {string} newStatus
 * @param {string} [trackingNumber]
 * @returns {Promise<object>}
 */
const updateOrderStatus = async (orderId, newStatus, trackingNumber = null) => {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw ApiError.notFound(`Order with ID '${orderId}' not found`);
  }

  const updates = { status: newStatus };
  if (trackingNumber) {
    updates.trackingNumber = trackingNumber;
  }
  if (newStatus === 'delivered' && !order.deliveryDate) {
    updates.deliveryDate = new Date();
  }

  await order.update(updates);
  return {
    id: order.id,
    status: order.status,
    tracking_number: order.trackingNumber,
    delivery_date: order.deliveryDate,
  };
};

module.exports = {
  formatLKR,
  getAnalyticsOverview,
  getAllOrders,
  updateOrderStatus,
};
