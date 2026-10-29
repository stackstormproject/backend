const service = require('../services/promoCode.service');
const { successResponse } = require('../utils/responseFormatter');

const handle =
  (fn, message, status = 200) =>
  async (req, res, next) => {
    try {
      return successResponse(res, (await fn(req)) ?? null, message, status);
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  list: handle(() => service.listPromoCodes(), 'Promo codes retrieved'),
  create: handle((req) => service.createPromoCode(req.body), 'Promo code created', 201),
  update: handle(
    (req) => service.updatePromoCode(Number(req.params.id), req.body),
    'Promo code updated'
  ),
  remove: handle((req) => service.deletePromoCode(Number(req.params.id)), 'Promo code deleted'),
};
