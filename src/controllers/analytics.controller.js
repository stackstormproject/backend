const analyticsService = require('../services/analytics.service');
const { successResponse } = require('../utils/responseFormatter');

/**
 * Retrieves dashboard overview metrics.
 * Route: GET /admin/analytics
 */
const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getAnalyticsOverview();
    return successResponse(res, data, 'Analytics overview retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves dashboard sales trend.
 * Route: GET /admin/analytics/sales-trend
 */
const getSalesTrend = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = await analyticsService.getSalesTrend(days);
    return successResponse(res, data, 'Sales trend retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOverview,
  getSalesTrend,
};
