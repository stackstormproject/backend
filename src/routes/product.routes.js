const { Router } = require('express');
const productController = require('../controllers/product.controller');
const { auth } = require('../middleware/auth');

const reviewController = require('../controllers/review.controller');

const router = Router();

// Public catalog listing and faceted search
router.get('/', productController.getProducts);

// Reviews for a product
router.get('/:id/reviews', reviewController.getProductReviews);
router.post('/:id/reviews', auth, reviewController.createReview);

// Public PDP detail lookup by SEO slug or ID
router.get('/:slug', productController.getProductBySlug);

// Product writes live under /admin/products (admin.routes.js).

module.exports = router;
