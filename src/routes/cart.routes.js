const router = require('express').Router();
const { optionalAuth, resolveCartIdentity } = require('../middleware/cartIdentity');
const controller = require('../controllers/cart.controller');

router.use(optionalAuth, resolveCartIdentity);

router.get('/', controller.getCart);
router.post('/items', controller.addItem);
router.patch('/items/:id', controller.updateItem);
router.delete('/items/:id', controller.removeItem);

module.exports = router;