const reservationService = require('../services/reservation.service');
const { successResponse } = require('../utils/responseFormatter');

const reserve = async (req, res, next) => {
  try {
    const customerId = Number(req.user.userId ?? req.user.id);
    // Anti-hoarding: drop any earlier hold before taking a new one
    await reservationService.releaseCustomerActiveReservations(customerId);
    const result = await reservationService.reserveStock({
      customerId,
      items: req.body.items,
    });
    return successResponse(res, result, 'Stock reserved');
  } catch (err) {
    return next(err);
  }
};

const release = async (req, res, next) => {
  try {
    const released = await reservationService.releaseReservation(req.params.id, {
      customerId: Number(req.user.userId ?? req.user.id), // ownership enforced in the service (403)
    });
    if (!released) {
      return res.status(409).json({
        success: false,
        error: 'RESERVATION_NOT_ACTIVE',
        message: 'Reservation was already confirmed, released or expired',
      });
    }
    return successResponse(res, { released: true }, 'Reservation released');
  } catch (err) {
    return next(err);
  }
};

module.exports = { reserve, release };
