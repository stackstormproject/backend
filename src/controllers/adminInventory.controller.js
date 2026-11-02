const service = require('../services/adminInventory.service');
const { successResponse } = require('../utils/responseFormatter');

const list = async (req, res, next) => {
  try {
    return successResponse(res, await service.listInventory(req.query), 'Inventory retrieved');
  } catch (error) {
    return next(error);
  }
};

const adjust = async (req, res, next) => {
  try {
    const result = await service.adjustStock(Number(req.params.variantId), {
      delta: req.body.delta,
      reason: req.body.reason,
      note: req.body.note,
      adminId: req.user.id,
    });
    return successResponse(res, result, 'Stock adjusted');
  } catch (error) {
    return next(error);
  }
};

const logs = async (req, res, next) => {
  try {
    const data = await service.listLogs(Number(req.params.variantId), req.query.limit);
    return successResponse(
      res,
      { logs: data, reasons: service.ADJUSTMENT_REASONS },
      'Logs retrieved'
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, adjust, logs };
