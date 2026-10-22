const reservationService = require('../services/reservation.service');
const logger = require('../config/logger');

const DEFAULT_INTERVAL_MS = 60 * 1000; // run every minute
const BATCH_SIZE = 100; // keep in sync with SWEEP_BATCH_SIZE in reservation.service.js

let timer = null;
let running = false;

/**
 * Releases expired holds, looping until no full batch is left. Never overlaps itself.
 * @returns {Promise<number>} total released (0 if a sweep is already running or it fails)
 */
const runExpirySweep = async () => {
  if (running) return 0;
  running = true;
  let total = 0;
  try {
    let released;
    do {
      // eslint-disable-next-line no-await-in-loop
      released = await reservationService.releaseExpiredReservations();
      total += released;
      if (released > 0) logger.info(`[RESERVATION EXPIRY] Released ${released} expired hold(s)`);
    } while (released >= BATCH_SIZE);
  } catch (err) {
    logger.error(`[RESERVATION EXPIRY] Sweep failed: ${err.message}`);
  } finally {
    running = false;
  }
  return total;
};

const startReservationExpiryJob = (intervalMs = DEFAULT_INTERVAL_MS) => {
  if (timer) return;
  timer = setInterval(runExpirySweep, intervalMs);
  if (timer.unref) timer.unref(); // don't keep the process alive just for this timer
  logger.info('[RESERVATION EXPIRY] Job started');
};

const stopReservationExpiryJob = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { startReservationExpiryJob, stopReservationExpiryJob, runExpirySweep };
