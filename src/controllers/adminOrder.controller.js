const adminOrderService = require('../services/adminOrder.service');
const { successResponse } = require('../utils/responseFormatter');
const { getOrderForAdmin } = require('../services/order.service');
const { sendInvoice } = require('../utils/sendInvoice');

const list = async (req, res, next) => {
  try {
    return successResponse(res, await adminOrderService.listOrders(req.query), 'Orders retrieved');
  } catch (error) {
    return next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    return successResponse(res, await adminOrderService.getOrder(req.params.id), 'Order retrieved');
  } catch (error) {
    return next(error);
  }
};

const invoice = async (req, res, next) => {
  try {
    return await sendInvoice(res, await getOrderForAdmin(req.params.id));
  } catch (error) {
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const result = await adminOrderService.updateStatus(req.params.id, {
      status: req.body.status,
      trackingNumber: req.body.tracking_number ?? req.body.trackingNumber,
      adminId: req.user.id,
    });
    return successResponse(res, result, 'Order status updated');
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, detail, invoice, updateStatus };
