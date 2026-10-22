const reservationService = require('../services/reservation.service');
const logger = require('../config/logger');
 
const DEFAULT_INTERVAL_MS = Number(process.env.RESERVATION_SWEEP_INTERVAL_MS) || 60000;
 
let expiryTimer = null;
let sweeping = false; // stops overlapping sweeps inside one process
 
/** Runs one sweep. Never throws, so a bad sweep cannot crash the server. */
const runExpirySweep = async () => {
  try {
    const count = await reservationService.releaseExpiredReservations();
    if (count > 0) {
      logger.info(`[RESERVATION EXPIRY JOB] Released ${count} expired reservation(s)`);
    }
    return count;
  } catch (err) {
    logger.error(`[RESERVATION EXPIRY JOB] Sweep failed: ${err.message}`);
    return 0;
  }
};
 
const startReservationExpiryJob = (intervalMs = DEFAULT_INTERVAL_MS) => {
  if (expiryTimer) clearInterval(expiryTimer);
 
  expiryTimer = setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await runExpirySweep();
    } finally {
      sweeping = false;
    }
  }, intervalMs);
 
  // unref: the timer alone must not keep Node (or Jest) alive
  if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
  logger.info(`[RESERVATION EXPIRY JOB] Started (interval: ${intervalMs}ms)`);
};
 
const stopReservationExpiryJob = () => {
  if (expiryTimer) {
    clearInterval(expiryTimer);
    expiryTimer = null;
    logger.info('[RESERVATION EXPIRY JOB] Stopped');
  }
};
 
module.exports = { startReservationExpiryJob, stopReservationExpiryJob, runExpirySweep };
