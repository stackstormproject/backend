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

// auth runs first so the limiter can key on req.user.id
router.post('/reserve', auth, customerOnly, createReserveLimiter(), controller.reserve);
router.delete('/reservations/:id', auth, customerOnly, controller.release);

module.exports = router;
