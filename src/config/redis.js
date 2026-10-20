const Redis = require('ioredis');
const logger = require('./logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) {
      logger.warn(
        '[REDIS] Max reconnect attempts reached. Operating in database-only fallback mode.'
      );
      return null;
    }
    return Math.min(times * 200, 1000);
  },
});

redisClient.on('connect', () => {
  logger.info('[REDIS] Connected successfully to Redis server');
});

redisClient.on('ready', () => {
  logger.info('[REDIS] Redis client is ready to accept commands');
});

redisClient.on('error', (err) => {
  logger.warn(`[REDIS] Connection issue: ${err.message}`);
});

// Attempt initial connection without blocking app boot if Redis is offline
redisClient.connect().catch((err) => {
  logger.warn(
    `[REDIS] Initial connection failed (${err.message}). Application will fall back to database.`
  );
});

module.exports = redisClient;
