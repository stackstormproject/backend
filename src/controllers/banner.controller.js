const service = require('../services/banner.service');
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
  listPublic: handle(() => service.listPublicBanners(), 'Banners retrieved'),
  list: handle(() => service.listBanners(), 'Banners retrieved'),
  upsert: handle((req) => service.upsertBanner(req.params.slot, req.body), 'Banner saved'),
  clear: handle((req) => service.clearBanner(req.params.slot), 'Banner cleared'),
};
