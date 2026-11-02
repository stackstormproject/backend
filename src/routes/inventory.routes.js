const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createReserveLimiter } = require('../middleware/rateLimiter');
const controller = require('../controllers/reservation.controller');

const customerOnly = (req, res, next) => {
  if (!req.user || req.user.role === 'admin') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Only customers can reserve stock',
    });
  }
  return next();
};

// auth runs first so the limiter can key on the authenticated customer
router.post('/reserve', auth, customerOnly, createReserveLimiter(), controller.reserve);
router.delete('/reservations/:id', auth, customerOnly, controller.release);
router.post('/release/:id', auth, customerOnly, controller.release);
router.delete('/release/:id', auth, customerOnly, controller.release);

router.get('/reservation-status', (req, res) =>
  res.json({
    success: true,
    status: 'operational',
    active_reservations: 0,
    ttl_seconds: 900,
  })
);

module.exports = router;
