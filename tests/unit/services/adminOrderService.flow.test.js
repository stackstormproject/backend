jest.mock('../../../src/models', () => ({
  Order: { findAndCountAll: jest.fn(), findByPk: jest.fn() },
  OrderItem: {},
  Customer: {},
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../../src/services/order.service', () => ({
  generateInvoiceNumber: jest.fn((order) => `DFC-2026-${String(order.id).padStart(4, '0')}`),
  getOrderForAdmin: jest.fn(),
}));
jest.mock('../../../src/services/reservation.service', () => ({ releaseReservation: jest.fn() }));
jest.mock('../../../src/services/stripe.service', () => ({ refundOrderPayment: jest.fn() }));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { Op } = require('sequelize');
const { Order, sequelize } = require('../../../src/models');
const { getOrderForAdmin } = require('../../../src/services/order.service');
const { releaseReservation } = require('../../../src/services/reservation.service');
const { refundOrderPayment } = require('../../../src/services/stripe.service');
const logger = require('../../../src/config/logger');
const service = require('../../../src/services/adminOrder.service');

// Refs #133: admin order search, detail and status rules (unit level; the database
// behaviour is covered by tests/integration/admin/orderManagement.test.js).
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const orderRow = (overrides = {}) => ({
  id: 12,
  status: 'processing',
  shippingOption: 'standard',
  trackingNumber: null,
  deliveryDate: null,
  update: jest.fn(function update(changes) {
    Object.assign(this, changes);
  }),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
});

describe('listOrders', () => {
  const listRow = (overrides = {}) => ({
    id: 12,
    customerId: 4,
    customer: { name: 'Alice', email: 'alice@example.com' },
    guestEmail: null,
    status: 'processing',
    shippingOption: 'standard',
    items: [{ quantity: 2 }, { quantity: 1 }],
    totalAmount: '4650.00',
    orderDate: '2026-10-27',
    trackingNumber: null,
    ...overrides,
  });

  it('should map rows and paginate with sane defaults', async () => {
    Order.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        listRow(),
        listRow({
          id: 13,
          customerId: null,
          customer: null,
          guestEmail: 'g@x.lk',
          items: undefined,
          totalAmount: null,
        }),
      ],
    });

    const result = await service.listOrders();

    expect(result.orders[0]).toMatchObject({
      invoice_number: 'DFC-2026-0012',
      customer_name: 'Alice',
      is_guest: false,
      items_count: 3,
      total_amount: 4650,
    });
    expect(result.orders[1]).toMatchObject({
      customer_name: 'Guest',
      customer_email: 'g@x.lk',
      is_guest: true,
      items_count: 0,
      total_amount: 0,
    });
    expect(result.pagination).toEqual({ total: 1, page: 1, limit: 20, total_pages: 1 });
    expect(Order.findAndCountAll.mock.calls[0][0].where).toEqual({});
  });

  it('should cap the page size and compute the offset', async () => {
    Order.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    const result = await service.listOrders({ page: '3', limit: '500' });

    expect(Order.findAndCountAll.mock.calls[0][0]).toMatchObject({ limit: 50, offset: 100 });
    expect(result.pagination.total_pages).toBe(1);
  });

  it('should reject an unknown status filter', async () => {
    await expect(service.listOrders({ status: 'lost' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should search by invoice number, id, email and name', async () => {
    Order.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await service.listOrders({ status: 'shipped', search: 'DFC-2026-0012' });
    const { where } = Order.findAndCountAll.mock.calls[0][0];
    const [statusCondition, search] = where[Op.and];

    expect(statusCondition).toEqual({ status: 'shipped' });
    expect(search[Op.or][0]).toEqual({ id: 12 });
    expect(search[Op.or]).toHaveLength(4);
  });

  it('should not add an id condition for a text search', async () => {
    Order.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await service.listOrders({ search: 'alice' });
    const { where } = Order.findAndCountAll.mock.calls[0][0];

    expect(where[Op.and][0][Op.or]).toHaveLength(3);
  });

  it('should treat #12 as an order id', async () => {
    Order.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await service.listOrders({ search: '#12' });

    expect(Order.findAndCountAll.mock.calls[0][0].where[Op.and][0][Op.or][0]).toEqual({ id: 12 });
  });
});

describe('getOrder', () => {
  it('should add the statuses the order may move to', async () => {
    getOrderForAdmin.mockResolvedValue({ id: 12, status: 'processing', shipping_option: 'pickup' });

    await expect(service.getOrder(12)).resolves.toMatchObject({
      allowed_statuses: ['shipped', 'cancelled', 'delivered'],
    });
  });
});

describe('updateStatus', () => {
  it('should reject an unknown or missing status before opening a transaction', async () => {
    await expect(service.updateStatus(12, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.updateStatus(12, { status: 'lost' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('should return 404 for a missing order', async () => {
    Order.findByPk.mockResolvedValue(null);

    await expect(service.updateStatus(99, { status: 'shipped' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('should refuse a transition the rules do not allow and list the allowed ones', async () => {
    Order.findByPk.mockResolvedValue(orderRow({ status: 'shipped' }));

    await expect(service.updateStatus(12, { status: 'processing' })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/allowed: delivered/),
    });
  });

  it('should explain when no further change is possible', async () => {
    Order.findByPk.mockResolvedValue(orderRow({ status: 'delivered' }));

    await expect(service.updateStatus(12, { status: 'shipped' })).rejects.toMatchObject({
      message: 'An order that is "delivered" cannot become "shipped"',
    });
  });

  it('should require a tracking number to ship a delivery order', async () => {
    Order.findByPk.mockResolvedValue(orderRow());

    await expect(
      service.updateStatus(12, { status: 'shipped', trackingNumber: '  ' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should ship with the trimmed tracking number', async () => {
    const order = orderRow();
    Order.findByPk.mockResolvedValue(order);

    const result = await service.updateStatus(12, {
      status: 'shipped',
      trackingNumber: ' RR123LK ',
      adminId: 1,
    });

    expect(order.update).toHaveBeenCalledWith(
      { status: 'shipped', trackingNumber: 'RR123LK' },
      { transaction }
    );
    expect(result).toMatchObject({
      status: 'shipped',
      refund: null,
      allowed_statuses: ['delivered'],
    });
  });

  it('should let a collection order ship without a tracking number', async () => {
    const order = orderRow({ shippingOption: 'pickup' });
    Order.findByPk.mockResolvedValue(order);

    await service.updateStatus(12, { status: 'shipped' });

    expect(order.update).toHaveBeenCalledWith({ status: 'shipped' }, { transaction });
  });

  it('should record the delivery date', async () => {
    const order = orderRow({ status: 'shipped' });
    Order.findByPk.mockResolvedValue(order);

    const result = await service.updateStatus(12, { status: 'delivered' });

    expect(result.delivery_date).toEqual(expect.any(Date));
  });

  it('should restock and refund a cancelled paid order', async () => {
    Order.findByPk.mockResolvedValue(orderRow());
    refundOrderPayment.mockResolvedValue({ refunded: true, amount: 4650 });

    const result = await service.updateStatus(12, { status: 'cancelled', adminId: 1 });

    expect(sequelize.query).toHaveBeenCalledTimes(2);
    expect(sequelize.query.mock.calls[1][1].replacements).toMatchObject({
      orderId: 12,
      adminId: 1,
      reason: 'Order DFC-2026-0012 cancelled',
    });
    expect(result.refund).toEqual({ refunded: true, amount: 4650 });
  });

  it('should report a failed refund without failing the cancellation', async () => {
    Order.findByPk.mockResolvedValue(orderRow());
    refundOrderPayment.mockRejectedValue(new Error('card network down'));

    const result = await service.updateStatus(12, { status: 'cancelled' });

    expect(result.refund).toEqual({
      refunded: false,
      error: 'Refund failed: issue it from the Stripe dashboard',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should release the stock hold of a cancelled unpaid order', async () => {
    Order.findByPk.mockResolvedValue(orderRow({ status: 'payment_pending' }));
    sequelize.query.mockResolvedValue([{ id: 'res-1' }]);
    releaseReservation.mockResolvedValue();

    const result = await service.updateStatus(12, { status: 'cancelled' });

    expect(releaseReservation).toHaveBeenCalledWith('res-1');
    expect(refundOrderPayment).not.toHaveBeenCalled();
    expect(result.refund).toBeNull();
  });

  it('should log but not fail when the hold cannot be released', async () => {
    Order.findByPk.mockResolvedValue(orderRow({ status: 'payment_pending' }));
    sequelize.query.mockResolvedValue([{ id: 'res-2' }]);
    releaseReservation.mockRejectedValue(new Error('already expired'));

    await expect(service.updateStatus(12, { status: 'cancelled' })).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should skip the release when an unpaid order has no active hold', async () => {
    Order.findByPk.mockResolvedValue(orderRow({ status: 'payment_pending' }));
    sequelize.query.mockResolvedValue([]);

    await service.updateStatus(12, { status: 'cancelled' });

    expect(releaseReservation).not.toHaveBeenCalled();
  });
});
