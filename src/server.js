require('dotenv').config({ quiet: true, override: true });
const http = require('http');
const { validateEnvironment } = require('./config/environment');

validateEnvironment();
const logger = require('./config/logger');
const app = require('./app');
const { sequelize } = require('./models');
const { initSocketServer } = require('./socket');

const {
  startReservationExpiryJob,
  stopReservationExpiryJob,
} = require('./jobs/reservationExpiry.job');

const port = process.env.PORT || 5000;

// Wrap Express in native HTTP server for Socket.IO mounting
const server = http.createServer(app);

// Mount real-time Socket.IO chat and support gateway
const io = initSocketServer(server);
app.set('io', io);

server.listen(port, async () => {
  logger.info('API listening', { port });
  try {
    await sequelize.authenticate();
    logger.info('[DATABASE] Connected successfully to PostgreSQL database', {
      database: sequelize.config.database,
      host: sequelize.config.host,
      port: sequelize.config.port,
    });
  } catch (error) {
    logger.error('[DATABASE] Unable to connect to PostgreSQL database', {
      error: error.message,
    });
  }
  startReservationExpiryJob();
});

const gracefulShutdown = () => {
  logger.info('Shutting down server and background jobs...');
  stopReservationExpiryJob();
  if (io) {
    io.close(() => {
      logger.info('Socket.IO connections closed');
    });
  }
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { server, io };
