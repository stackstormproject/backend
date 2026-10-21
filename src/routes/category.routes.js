const { Router } = require('express');
const categoryController = require('../controllers/category.controller');
const { auth } = require('../middleware/auth');

const router = Router();

// Public discovery route: full category hierarchy with sub-millisecond caching
router.get('/', categoryController.getCategories);

// Administrative routes with automatic cache invalidation
router.post('/', auth, categoryController.createCategory);
router.put('/:id', auth, categoryController.updateCategory);
router.delete('/:id', auth, categoryController.deleteCategory);

module.exports = router;
