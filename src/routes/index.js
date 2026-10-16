const { Router } = require('express');
const { router: authRouter } = require('./auth.routes');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.use('/auth', authRouter);

module.exports = router;
