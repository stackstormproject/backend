const { Router } = require('express');
const { router: authRouter } = require('./auth.routes');
const categoryRouter = require('./category.routes');
const productRouter = require('./product.routes');
const uploadRouter = require('./upload.routes');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.use('/auth', authRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/upload', uploadRouter);

// Support /api/v1 prefix per SRS & architectural guide
const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/categories', categoryRouter);
v1Router.use('/products', productRouter);
v1Router.use('/upload', uploadRouter);
router.use('/v1', v1Router);

module.exports = router;
