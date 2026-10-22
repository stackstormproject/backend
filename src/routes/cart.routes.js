const router = require('express').Router();
const {
  optionalAuth,
  resolveCartIdentity,
  requireCustomer,
} = require('../middleware/cartIdentity');
const controller = require('../controllers/cart.controller');

router.use(optionalAuth);

// Merge needs a logged-in customer, not a cart owner, so it skips resolveCartIdentity
router.post('/merge', requireCustomer, controller.mergeCart);

router.use(resolveCartIdentity);

router.get('/', controller.getCart);
router.post('/items', controller.addItem);
router.patch('/items/:id', controller.updateItem);
router.delete('/items/:id', controller.removeItem);

module.exports = router;
