// ==============================================================================
// Product Catalog Controller - Faceted Filtering & PDP Resolution
// Why this file matters: Validates inbound query parameters, routes requests to
// the high-performance product query service, and returns structured PDP data.
// ==============================================================================

const productService = require('../services/product.service');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

/**
 * Controller for retrieving complete product details by SEO-friendly URL slug.
 * E.g., GET /api/v1/products/handloom-linen-batik-shirt
 */
const getProductBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const product = await productService.getProductBySlug(slug);

    if (!product) {
      return errorResponse(res, `Product not found: ${slug}`, [], 404);
    }

    return successResponse(res, product, 'Product details retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller for retrieving paginated product catalog with multi-faceted filtering.
 * E.g., GET /api/v1/products?category_id=1&size=L&min_price=2000
 */
const getProducts = async (req, res, next) => {
  try {
    const categoryId = req.query.category_id || req.query.categoryId || req.query.category;
    const minPrice = req.query.min_price !== undefined ? req.query.min_price : req.query.minPrice;
    const maxPrice = req.query.max_price !== undefined ? req.query.max_price : req.query.maxPrice;
    const search = req.query.search || req.query.q || req.query.keyword;
    const { size, color, sort, page = 1, limit = 12 } = req.query;

    const result = await productService.listProducts({
      categoryId,
      minPrice,
      maxPrice,
      size,
      color,
      sort,
      search,
      page,
      limit,
    });

    return successResponse(res, result, 'Products retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller for updating an existing product with automatic cache eviction.
 * E.g., PUT /api/v1/products/:id
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await productService.updateProduct(id, req.body);
    return successResponse(res, product, 'Product updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller for deleting an existing product with automatic cache eviction.
 * E.g., DELETE /api/v1/products/:id
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    await productService.deleteProduct(id);
    return successResponse(res, null, 'Product deleted successfully', 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProductBySlug,
  getProducts,
  updateProduct,
  deleteProduct,
};
