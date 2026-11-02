const service = require('../services/brand.service');
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
  listPublic: handle(() => service.listPublicBrands(), 'Brands retrieved'),
  list: handle(() => service.listBrands(), 'Brands retrieved'),
  create: handle((req) => service.createBrand(req.body), 'Brand created', 201),
  update: handle((req) => service.updateBrand(Number(req.params.id), req.body), 'Brand updated'),
  remove: handle((req) => service.deleteBrand(Number(req.params.id)), 'Brand deleted'),
};
