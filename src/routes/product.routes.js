const { Router } = require('express');
const productController = require('../controllers/product.controller');

const router = Router();

// Public catalog listing and faceted search
router.get('/', productController.getProducts);

// Public PDP detail lookup by SEO slug or ID
router.get('/:slug', productController.getProductBySlug);

module.exports = router;
