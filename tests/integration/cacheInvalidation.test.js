const request = require('supertest');
const app = require('../../src/app');
const redisClient = require('../../src/config/redis');
const { Product, Category, sequelize } = require('../../src/models');
const { generateAccessToken } = require('../../src/utils/tokenGenerator');
const cacheService = require('../../src/services/cache.service');

describe('Cache Invalidation Pipeline & Cache-Aside Integration Tests (STORM-022)', () => {
  let adminToken;
  let customerToken;

  beforeAll(() => {
    adminToken = generateAccessToken(1, 'admin');
    customerToken = generateAccessToken(2, 'customer');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (redisClient.status === 'ready') {
        await redisClient.quit();
      } else {
        redisClient.disconnect();
      }
    } catch {
      // Ignore
    }
    try {
      await sequelize.close();
    } catch {
      // Ignore
    }
  });

  describe('Product Cache-Aside & Mutation Invalidation', () => {
    it('should prime cache on product GET and serve from cache on subsequent request', async () => {
      const mockProduct = {
        id: 10,
        name: 'Handloom Linen Batik Shirt',
        slug: 'handloom-linen-batik-shirt',
        price: 4500,
        variants: [],
        reviews: [],
      };

      const getSpy = jest.spyOn(redisClient, 'get').mockResolvedValueOnce(null);
      const setexSpy = jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');
      jest.spyOn(Product, 'findOne').mockResolvedValue(mockProduct);

      // Request 1: Cache MISS, fetch from DB and prime Redis
      const res1 = await request(app).get('/api/v1/products/handloom-linen-batik-shirt');

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.name).toBe('Handloom Linen Batik Shirt');
      expect(getSpy).toHaveBeenCalledWith('cache:product:slug:handloom-linen-batik-shirt');
      expect(setexSpy).toHaveBeenCalledWith(
        'cache:product:slug:handloom-linen-batik-shirt',
        3600,
        expect.any(String)
      );

      // Request 2: Cache HIT from Redis
      jest
        .spyOn(redisClient, 'get')
        .mockResolvedValueOnce(JSON.stringify({ ...mockProduct, price: 4500 }));

      const res2 = await request(app).get('/api/v1/products/handloom-linen-batik-shirt');

      expect(res2.status).toBe(200);
      expect(res2.body.data.price).toBe(4500);
    });

    it('should reject unauthenticated PUT /api/v1/products/:id with 401', async () => {
      const res = await request(app).put('/api/v1/products/10').send({ price: 5500 });

      expect(res.status).toBe(401);
    });

    it('should reject customer role on PUT /api/v1/products/:id with 403', async () => {
      const res = await request(app)
        .put('/api/v1/products/10')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ price: 5500 });

      expect(res.status).toBe(403);
    });

    it('should invalidate product cache keys and pattern upon admin PUT update', async () => {
      const existingProduct = {
        id: 10,
        slug: 'handloom-linen-batik-shirt',
        name: 'Handloom Linen Batik Shirt',
        price: 4500,
        update: jest.fn().mockImplementation(function (data) {
          Object.assign(this, data);
          return Promise.resolve(this);
        }),
      };

      jest.spyOn(Product, 'findByPk').mockResolvedValue(existingProduct);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      const scanSpy = jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      const res = await request(app)
        .put('/api/v1/products/10')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 5500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(existingProduct.update).toHaveBeenCalledWith({ price: 5500 });

      // Verifies cache invalidation occurred
      expect(delSpy).toHaveBeenCalledWith(
        'cache:product:10',
        'cache:product:slug:handloom-linen-batik-shirt'
      );
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:product:*', 'COUNT', 100);
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:products:*', 'COUNT', 100);
    });

    it('should invalidate product cache upon admin DELETE /api/v1/products/:id', async () => {
      const existingProduct = {
        id: 10,
        slug: 'handloom-linen-batik-shirt',
        destroy: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Product, 'findByPk').mockResolvedValue(existingProduct);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      const scanSpy = jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      const res = await request(app)
        .delete('/api/v1/products/10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(existingProduct.destroy).toHaveBeenCalled();
      expect(delSpy).toHaveBeenCalledWith(
        'cache:product:10',
        'cache:product:slug:handloom-linen-batik-shirt'
      );
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:product:*', 'COUNT', 100);
    });
  });

  describe('Category Cache Invalidation', () => {
    it('should evict category tree and sub-tree caches upon category PUT', async () => {
      const existingCategory = {
        id: 1,
        name: 'Men',
        update: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Category, 'findByPk').mockResolvedValue(existingCategory);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);
      const scanSpy = jest.spyOn(redisClient, 'scan').mockResolvedValue(['0', []]);

      const res = await request(app)
        .put('/api/v1/categories/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: "Men's Premium" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(existingCategory.update).toHaveBeenCalledWith({ name: "Men's Premium" });

      // Verifies cache:categories:tree was evicted
      expect(delSpy).toHaveBeenCalledWith('cache:categories:tree');
      expect(scanSpy).toHaveBeenCalledWith('0', 'MATCH', 'cache:categories:*', 'COUNT', 100);
    });

    it('should return fresh category tree from DB after cache invalidation', async () => {
      const updatedCategories = [
        {
          id: 1,
          name: "Men's Premium",
          slug: 'mens-premium',
          parentId: null,
          isActive: true,
          toJSON() {
            return { id: 1, name: "Men's Premium", slug: 'mens-premium', parentId: null, isActive: true };
          },
        },
      ];

      jest.spyOn(redisClient, 'get').mockResolvedValueOnce(null);
      jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');
      jest.spyOn(Category, 'findAll').mockResolvedValue(updatedCategories);

      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body.data[0].name).toBe("Men's Premium");
    });
  });
});
