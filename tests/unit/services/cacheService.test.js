const cacheService = require('../../../src/services/cache.service');
const redisClient = require('../../../src/config/redis');

describe('cacheService Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('should return parsed JSON when key exists in Redis', async () => {
      const payload = { id: 1, name: 'Batik Shirt' };
      jest.spyOn(redisClient, 'get').mockResolvedValue(JSON.stringify(payload));

      const result = await cacheService.get('cache:product:1');

      expect(result).toEqual(payload);
      expect(redisClient.get).toHaveBeenCalledWith('cache:product:1');
    });

    it('should return null when key does not exist', async () => {
      jest.spyOn(redisClient, 'get').mockResolvedValue(null);

      const result = await cacheService.get('cache:nonexistent');

      expect(result).toBeNull();
    });

    it('should catch error, log warning, and return null when Redis throws', async () => {
      jest.spyOn(redisClient, 'get').mockRejectedValue(new Error('Connection failure'));

      const result = await cacheService.get('cache:broken');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should use setex when ttlSeconds is provided and greater than zero', async () => {
      jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');

      const result = await cacheService.set('cache:test', { ok: true }, 60);

      expect(result).toBe(true);
      expect(redisClient.setex).toHaveBeenCalledWith('cache:test', 60, JSON.stringify({ ok: true }));
    });

    it('should use standard set when ttlSeconds is not provided or zero', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue('OK');

      const result = await cacheService.set('cache:test:nottl', { ok: true });

      expect(result).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith('cache:test:nottl', JSON.stringify({ ok: true }));
    });

    it('should catch error and return false when Redis set fails', async () => {
      jest.spyOn(redisClient, 'set').mockRejectedValue(new Error('Write error'));

      const result = await cacheService.set('cache:fail', { ok: false });

      expect(result).toBe(false);
    });
  });

  describe('del', () => {
    it('should delete a single key', async () => {
      jest.spyOn(redisClient, 'del').mockResolvedValue(1);

      const result = await cacheService.del('cache:item:1');

      expect(result).toBe(1);
      expect(redisClient.del).toHaveBeenCalledWith('cache:item:1');
    });

    it('should delete an array of keys', async () => {
      jest.spyOn(redisClient, 'del').mockResolvedValue(2);

      const result = await cacheService.del(['cache:item:1', 'cache:item:2']);

      expect(result).toBe(2);
      expect(redisClient.del).toHaveBeenCalledWith('cache:item:1', 'cache:item:2');
    });

    it('should return 0 when deleting an empty array of keys', async () => {
      const spy = jest.spyOn(redisClient, 'del');

      const result = await cacheService.del([]);

      expect(result).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should catch error and return 0 when delete fails', async () => {
      jest.spyOn(redisClient, 'del').mockRejectedValue(new Error('Delete error'));

      const result = await cacheService.del('cache:error');

      expect(result).toBe(0);
    });
  });

  describe('getOrSet', () => {
    it('should return cached data on cache hit without invoking fetcherFn', async () => {
      const cached = { id: 42, title: 'Cached Product' };
      jest.spyOn(redisClient, 'get').mockResolvedValue(JSON.stringify(cached));
      const fetcherFn = jest.fn();

      const result = await cacheService.getOrSet('cache:product:42', 3600, fetcherFn);

      expect(result).toEqual(cached);
      expect(fetcherFn).not.toHaveBeenCalled();
    });

    it('should invoke fetcherFn and populate cache on cache miss', async () => {
      const fresh = { id: 42, title: 'Fresh Product' };
      jest.spyOn(redisClient, 'get').mockResolvedValue(null);
      jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');
      const fetcherFn = jest.fn().mockResolvedValue(fresh);

      const result = await cacheService.getOrSet('cache:product:42', 3600, fetcherFn);

      expect(result).toEqual(fresh);
      expect(fetcherFn).toHaveBeenCalledTimes(1);
      expect(redisClient.setex).toHaveBeenCalledWith('cache:product:42', 3600, JSON.stringify(fresh));
    });

    it('should not write to cache if fetcherFn returns null or undefined', async () => {
      jest.spyOn(redisClient, 'get').mockResolvedValue(null);
      const setexSpy = jest.spyOn(redisClient, 'setex');
      const fetcherFn = jest.fn().mockResolvedValue(null);

      const result = await cacheService.getOrSet('cache:product:null', 3600, fetcherFn);

      expect(result).toBeNull();
      expect(fetcherFn).toHaveBeenCalledTimes(1);
      expect(setexSpy).not.toHaveBeenCalled();
    });
  });

  describe('invalidatePattern', () => {
    it('should iteratively scan and delete keys in batches until cursor is 0', async () => {
      const scanSpy = jest
        .spyOn(redisClient, 'scan')
        .mockResolvedValueOnce(['10', ['cache:product:1', 'cache:product:2']])
        .mockResolvedValueOnce(['0', ['cache:product:3']]);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(2);

      const totalEvicted = await cacheService.invalidatePattern('cache:product:*');

      expect(totalEvicted).toBe(3);
      expect(scanSpy).toHaveBeenCalledTimes(2);
      expect(delSpy).toHaveBeenCalledWith('cache:product:1', 'cache:product:2');
      expect(delSpy).toHaveBeenCalledWith('cache:product:3');
    });

    it('should handle zero matching keys correctly without calling del', async () => {
      jest.spyOn(redisClient, 'scan').mockResolvedValueOnce(['0', []]);
      const delSpy = jest.spyOn(redisClient, 'del');

      const totalEvicted = await cacheService.invalidatePattern('cache:nonexistent:*');

      expect(totalEvicted).toBe(0);
      expect(delSpy).not.toHaveBeenCalled();
    });

    it('should catch error, log warning, and return 0 if scan throws', async () => {
      jest.spyOn(redisClient, 'scan').mockRejectedValue(new Error('Scan failed'));

      const totalEvicted = await cacheService.invalidatePattern('cache:err:*');

      expect(totalEvicted).toBe(0);
    });
  });

  describe('invalidateProductCache', () => {
    it('should delete specific id and slug keys, then purge product patterns', async () => {
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      const scanSpy = jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      await cacheService.invalidateProductCache(10, 'batik-shirt');

      expect(delSpy).toHaveBeenCalledWith('cache:product:10', 'cache:product:slug:batik-shirt');
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:product:*', 'COUNT', 100);
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:products:*', 'COUNT', 100);
    });

    it('should handle missing id or slug gracefully', async () => {
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      await cacheService.invalidateProductCache(null, null);

      expect(delSpy).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCategoryCache', () => {
    it('should delete category tree and pattern caches', async () => {
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      const scanSpy = jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      await cacheService.invalidateCategoryCache();

      expect(delSpy).toHaveBeenCalledWith('cache:categories:tree');
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:categories:*', 'COUNT', 100);
    });
  });

  afterAll(async () => {
    try {
      if (redisClient.status === 'ready') {
        await redisClient.quit();
      } else {
        redisClient.disconnect();
      }
    } catch {
      // Ignore disconnect error in tests
    }
  });
});
