const { Router } = require('express');
const productController = require('../controllers/product.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = Router();

// Public catalog listing and faceted search
router.get('/', productController.getProducts);

// Public PDP detail lookup by SEO slug or ID
router.get('/:slug', productController.getProductBySlug);

// Admin-guarded mutations with automatic cache eviction
router.put('/:id', auth, rbac(['admin']), productController.updateProduct);
router.delete('/:id', auth, rbac(['admin']), productController.deleteProduct);

module.exports = router;
