// ==============================================================================
// Cache Service - Centralized Redis Cache-Aside & Invalidation Pipeline
// Why this file matters: Implements the Cache-Aside pattern with resilient fallback,
// and safe non-blocking pattern invalidation using Redis SCAN cursors.
// ==============================================================================

const redisClient = require('../config/redis');
const logger = require('../config/logger');

/**
 * Retrieves a deserialized JSON value from Redis.
 *
 * @param {string} key - Redis cache key
 * @returns {Promise<any|null>} Deserialized cached object or null
 */
const get = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.warn(`[CACHE] Failed to get key "${key}": ${err.message}`);
    return null;
  }
};

/**
 * Serializes and stores a value in Redis with optional TTL.
 *
 * @param {string} key - Redis cache key
 * @param {any} value - Value to cache (will be JSON serialized)
 * @param {number} [ttlSeconds] - Time-to-live in seconds
 * @returns {Promise<boolean>} Success flag
 */
const set = async (key, value, ttlSeconds) => {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds && Number(ttlSeconds) > 0) {
      await redisClient.setex(key, Number(ttlSeconds), serialized);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (err) {
    logger.warn(`[CACHE] Failed to set key "${key}": ${err.message}`);
    return false;
  }
};

/**
 * Deletes one or multiple keys from Redis.
 *
 * @param {string|Array<string>} key - Key or array of keys to delete
 * @returns {Promise<number>} Number of keys removed
 */
const del = async (key) => {
  try {
    if (Array.isArray(key)) {
      if (key.length === 0) return 0;
      return await redisClient.del(...key);
    }
    return await redisClient.del(key);
  } catch (err) {
    logger.warn(`[CACHE] Failed to delete key "${key}": ${err.message}`);
    return 0;
  }
};

/**
 * Cache-Aside helper: returns cached item or fetches, caches, and returns fresh data.
 *
 * @param {string} key - Redis cache key
 * @param {number} ttlSeconds - Expiration in seconds
 * @param {Function} fetcherFn - Asynchronous callback retrieving data on cache miss
 * @returns {Promise<any>} Cached or freshly fetched payload
 */
const getOrSet = async (key, ttlSeconds, fetcherFn) => {
  const cached = await get(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const freshData = await fetcherFn();
  if (freshData !== null && freshData !== undefined) {
    await set(key, freshData, ttlSeconds);
  }
  return freshData;
};

/**
 * Non-blocking pattern invalidation using Redis SCAN cursor (chunk size COUNT 100).
 * Prevents event-loop blocking caused by synchronous KEYS * queries.
 *
 * @param {string} pattern - Glob pattern (e.g., 'cache:product:*')
 * @returns {Promise<number>} Total number of evicted keys
 */
const invalidatePattern = async (pattern) => {
  try {
    let cursor = '0';
    let totalEvicted = 0;

    do {
      // Redis SCAN cursors require sequential iteration where iteration N+1 depends on cursor N
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys && keys.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await redisClient.del(...keys);
        totalEvicted += keys.length;
      }
    } while (cursor !== '0');

    logger.info(`[CACHE] Invalidated cache pattern "${pattern}": evicted ${totalEvicted} key(s)`);
    return totalEvicted;
  } catch (err) {
    logger.warn(`[CACHE] Failed to invalidate pattern "${pattern}": ${err.message}`);
    return 0;
  }
};

/**
 * Invalidates individual product keys and pattern caches.
 *
 * @param {number|string} [id] - Product ID
 * @param {string} [slug] - Product URL slug
 * @returns {Promise<void>}
 */
const invalidateProductCache = async (id, slug) => {
  const specificKeys = [];
  if (id) {
    specificKeys.push(`cache:product:${id}`);
  }
  if (slug) {
    specificKeys.push(`cache:product:slug:${slug}`);
  }

  if (specificKeys.length > 0) {
    await del(specificKeys);
  }

  await invalidatePattern('cache:product:*');
  await invalidatePattern('cache:products:*');
};

/**
 * Invalidates category tree and sub-tree caches.
 *
 * @returns {Promise<void>}
 */
const invalidateCategoryCache = async () => {
  await del('cache:categories:tree');
  await invalidatePattern('cache:categories:*');
};

module.exports = {
  get,
  set,
  del,
  getOrSet,
  invalidatePattern,
  invalidateProductCache,
  invalidateCategoryCache,
};
