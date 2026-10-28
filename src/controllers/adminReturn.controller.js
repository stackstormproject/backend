const service = require('../services/adminReturn.service');
const { successResponse } = require('../utils/responseFormatter');

const handle = (fn, message) => async (req, res, next) => {
  try {
    return successResponse(res, await fn(req), message);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  list: handle((req) => service.listReturns(req.query), 'Returns retrieved'),
  detail: handle((req) => service.getReturn(Number(req.params.id)), 'Return retrieved'),
  approve: handle(
    (req) => service.approveReturn(Number(req.params.id), req.user.id, req.body?.note),
    'Return approved'
  ),
  reject: handle(
    (req) => service.rejectReturn(Number(req.params.id), req.user.id, req.body?.note),
    'Return rejected'
  ),
  receive: handle(
    (req) =>
      service.receiveReturn(Number(req.params.id), req.user.id, {
        acceptable: req.body?.acceptable,
        note: req.body?.note,
      }),
    'Return received'
  ),
};
