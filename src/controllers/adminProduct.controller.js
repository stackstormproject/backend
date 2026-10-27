const service = require('../services/adminProduct.service');
const { successResponse } = require('../utils/responseFormatter');

const handle =
  (fn, message, status = 200) =>
  async (req, res, next) => {
    try {
      const data = await fn(req);
      return successResponse(res, data ?? null, message, status);
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  list: handle((req) => service.listProducts(req.query), 'Products retrieved'),
  detail: handle((req) => service.getProduct(Number(req.params.id)), 'Product retrieved'),
  create: handle((req) => service.createProduct(req.body, req.user.id), 'Product created', 201),
  update: handle(
    (req) => service.updateProduct(Number(req.params.id), req.body),
    'Product updated'
  ),
  remove: handle((req) => service.deleteProduct(Number(req.params.id)), 'Product deleted'),
  addVariant: handle(
    (req) => service.addVariant(Number(req.params.id), req.body, req.user.id),
    'Size added',
    201
  ),
  updateVariant: handle(
    (req) => service.updateVariant(Number(req.params.id), Number(req.params.variantId), req.body),
    'Size updated'
  ),
  removeVariant: handle(
    (req) => service.removeVariant(Number(req.params.id), Number(req.params.variantId)),
    'Size deleted'
  ),
};
