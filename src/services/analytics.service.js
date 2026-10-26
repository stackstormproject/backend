const { Op } = require('sequelize');
const {
  Order,
  OrderItem,
  ProductVariant,
  Product,
  Customer,
  Return,
  ChatSession,
} = require('../models');
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
  const [orders, customersCount, returnsCount, lowStockCount, supportQueueCount] =
    await Promise.all([
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
                include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
              },
            ],
          },
        ],
        order: [['order_date', 'DESC']],
      }),
      Customer.count(),
      Return.count(),
      ProductVariant?.count
        ? ProductVariant.count({ where: { stockQuantity: { [Op.lte]: 5 } } }).catch(() => 0)
        : 0,
      ChatSession?.count
        ? ChatSession.count({ where: { status: ['open', 'waiting'] } }).catch(() => 0)
        : 0,
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
      const prodTitle =
        item.variant?.product?.name || item.variant?.product?.title || 'Unknown Product';
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
      low_stock_count: lowStockCount || 0,
      support_queue_count: supportQueueCount || 0,
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
 * Aggregates daily, weekly, and monthly sales trends from actual database orders.
 *
 * @param {number} [days=30]
 * @returns {Promise<object>}
 */
const getSalesTrend = async (days = 30) => {
  const orders = await Order.findAll({
    attributes: ['id', 'status', 'totalAmount', 'orderDate'],
    where: {
      status: { [Op.ne]: 'cancelled' },
    },
    order: [['order_date', 'ASC']],
  });

  const now = new Date();

  // Daily (past 7 days)
  const daily = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = daysOfWeek[d.getDay()];

    const matchingOrders = orders.filter((o) => {
      const od = new Date(o.orderDate).toISOString().split('T')[0];
      return od === dateStr;
    });

    const rev = matchingOrders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
    daily.push({
      label,
      date: dateStr,
      revenue: Number(rev.toFixed(2)),
      orders: matchingOrders.length,
    });
  }

  // Weekly (past 4 weeks)
  const weekly = [];
  for (let w = 3; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (w + 1) * 7);
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);

    const matchingOrders = orders.filter((o) => {
      const od = new Date(o.orderDate);
      return od >= start && od < end;
    });

    const rev = matchingOrders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
    const label = `W${4 - w}`;
    weekly.push({
      label,
      date: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      revenue: Number(rev.toFixed(2)),
      orders: matchingOrders.length,
    });
  }

  // Monthly (past 6 months)
  const monthly = [];
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const nextD = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const label = monthNames[d.getMonth()];

    const matchingOrders = orders.filter((o) => {
      const od = new Date(o.orderDate);
      return od >= d && od < nextD;
    });

    const rev = matchingOrders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
    monthly.push({
      label,
      date: `${label} ${d.getFullYear()}`,
      revenue: Number(rev.toFixed(2)),
      orders: matchingOrders.length,
    });
  }

  return {
    salesTrend: {
      daily,
      weekly,
      monthly,
    },
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
      order_number: o.trackingNumber || `DFC-202610-${1000 + o.id}`,
      customer_id: o.customerId,
      customer_name: o.customer?.name || o.guestEmail || 'Guest Customer',
      customer_email: o.customer?.email || o.guestEmail || '',
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
  getSalesTrend,
  getAllOrders,
  updateOrderStatus,
};
