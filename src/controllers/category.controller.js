// ==============================================================================
// Category Controller - HTTP Interface & Cache Header Injection
// Why this file matters: Serves public category trees with RFC-compliant X-Cache
// telemetry headers and handles administrative mutations.
// ==============================================================================

const categoryService = require('../services/category.service');
const { successResponse } = require('../utils/responseFormatter');

/**
 * Handles retrieval of hierarchical category tree.
 * Inspects 'fromCache' status and sets 'X-Cache: HIT' or 'X-Cache: MISS' headers.
 */
const getCategories = async (req, res, next) => {
  try {
    const result = await categoryService.getCategoryTree();
    res.set('X-Cache', result.fromCache ? 'HIT' : 'MISS');
    return successResponse(res, result.data, 'Category hierarchy retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * Admin controller for creating a category with automatic cache eviction.
 */
const createCategory = async (req, res, next) => {
  try {
    const category = await categoryService.createCategory(req.body);
    return successResponse(res, category, 'Category created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Admin controller for updating a category with automatic cache eviction.
 */
const updateCategory = async (req, res, next) => {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    return successResponse(res, category, 'Category updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Admin controller for deleting a category with automatic cache eviction.
 */
const deleteCategory = async (req, res, next) => {
  try {
    await categoryService.deleteCategory(req.params.id);
    return successResponse(res, null, 'Category deleted successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
