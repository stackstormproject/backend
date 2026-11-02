const { Router } = require('express');
const categoryController = require('../controllers/category.controller');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { MANAGER_ROLES } = require('../config/constants');

const router = Router();

// Public discovery route: full category hierarchy with sub-millisecond caching
router.get('/', categoryController.getCategories);

// Administrative routes with automatic cache invalidation
// Any logged-in customer could change categories before (#132).
router.post('/', auth, rbac(MANAGER_ROLES), categoryController.createCategory);
router.put('/:id', auth, rbac(MANAGER_ROLES), categoryController.updateCategory);
router.delete('/:id', auth, rbac(MANAGER_ROLES), categoryController.deleteCategory);

module.exports = router;
