require('dotenv').config({ quiet: true, override: true });
const { validateEnvironment } = require('./config/environment');

validateEnvironment();
const logger = require('./config/logger');
const app = require('./app');

const {
  startReservationExpiryJob,
  stopReservationExpiryJob,
} = require('./jobs/reservationExpiry.job');

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  logger.info('API listening', { port });
  startReservationExpiryJob();
});

const gracefulShutdown = () => {
  logger.info('Shutting down server and background jobs...');
  stopReservationExpiryJob();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
