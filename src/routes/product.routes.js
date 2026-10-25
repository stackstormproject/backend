const { Router } = require('express');
const productController = require('../controllers/product.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const reviewController = require('../controllers/review.controller');

const router = Router();

// Public catalog listing and faceted search
router.get('/', productController.getProducts);

// Reviews for a product
router.get('/:id/reviews', reviewController.getProductReviews);
router.post('/:id/reviews', auth, reviewController.createReview);

// Public PDP detail lookup by SEO slug or ID
router.get('/:slug', productController.getProductBySlug);

// Admin-guarded mutations with automatic cache eviction
router.put('/:id', auth, rbac(['admin']), productController.updateProduct);
router.delete('/:id', auth, rbac(['admin']), productController.deleteProduct);

module.exports = router;
