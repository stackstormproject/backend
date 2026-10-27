const service = require('../services/adminCustomer.service');
const { successResponse } = require('../utils/responseFormatter');

const handle = (fn, message) => async (req, res, next) => {
  try {
    return successResponse(res, await fn(req), message);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  list: handle((req) => service.listCustomers(req.query), 'Customers retrieved'),
  detail: handle((req) => service.getCustomer(Number(req.params.id)), 'Customer retrieved'),
  adjustPoints: handle(
    (req) => service.adjustPoints(Number(req.params.id), req.body || {}, req.user.id),
    'Points adjusted'
  ),
};
