const { Router } = require('express');
const { router: authRouter } = require('./auth.routes');
const categoryRouter = require('./category.routes');
const productRouter = require('./product.routes');
const uploadRouter = require('./upload.routes');
const cartRouter = require('./cart.routes');
const inventoryRouter = require('./inventory.routes');
const wishlistRouter = require('./wishlist.routes');

const userRouter = require('./user.routes');
const checkoutRouter = require('./checkout.routes');
const paymentRouter = require('./payment.routes');

const router = Router();

const healthHandler = (req, res) => {
  res.json({ status: 'ok', success: true, uptime: process.uptime() });
};

router.get('/health', healthHandler);

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/upload', uploadRouter);
router.use('/cart', cartRouter);
router.use('/checkout', checkoutRouter);
router.use('/payments', paymentRouter);
router.use('/inventory', inventoryRouter);
router.use('/wishlist', wishlistRouter);

// Support /api/v1 prefix per SRS & architectural guide
const v1Router = Router();
v1Router.get('/health', healthHandler);
v1Router.use('/auth', authRouter);
v1Router.use('/users', userRouter);
v1Router.use('/categories', categoryRouter);
v1Router.use('/products', productRouter);
v1Router.use('/upload', uploadRouter);
v1Router.use('/cart', cartRouter);
v1Router.use('/checkout', checkoutRouter);
v1Router.use('/payments', paymentRouter);
v1Router.use('/inventory', inventoryRouter);
v1Router.use('/wishlist', wishlistRouter);
router.use('/v1', v1Router);

module.exports = router;
