const request = require('supertest');
const app = require('../../src/app');
const redisClient = require('../../src/config/redis');
const { Category, sequelize } = require('../../src/models');

describe('GET /api/v1/categories - Cache-Aside & Hierarchy Integration', () => {
  beforeAll(async () => {
    // Prime in-memory mock or ensure test categories exist if DB is connected
    jest.spyOn(Category, 'findAll').mockResolvedValue([
      {
        id: 1,
        name: 'Men',
        slug: 'men',
        description: "Men's Clothing",
        parentId: null,
        isActive: true,
        sortOrder: 1,
        toJSON() {
          return {
            id: 1,
            name: 'Men',
            slug: 'men',
            description: "Men's Clothing",
            parentId: null,
            isActive: true,
            sortOrder: 1,
          };
        },
      },
      {
        id: 2,
        name: 'Handloom Batik Shirts',
        slug: 'handloom-batik-shirts',
        description: 'Authentic Sri Lankan Batik',
        parentId: 1,
        isActive: true,
        sortOrder: 1,
        toJSON() {
          return {
            id: 2,
            name: 'Handloom Batik Shirts',
            slug: 'handloom-batik-shirts',
            description: 'Authentic Sri Lankan Batik',
            parentId: 1,
            isActive: true,
            sortOrder: 1,
          };
        },
      },
    ]);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      if (redisClient.status === 'ready') {
        await redisClient.quit();
      } else {
        redisClient.disconnect();
      }
    } catch (e) {
      // Ignore disconnect error in tests
    }
    try {
      await sequelize.close();
    } catch (e) {
      // Ignore
    }
  });

  it('should return nested categories with X-Cache MISS on initial request', async () => {
    // Invalidate cache before test
    jest.spyOn(redisClient, 'get').mockResolvedValueOnce(null);
    jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');

    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('men');
    expect(res.body.data[0].children).toHaveLength(1);
    expect(res.body.data[0].children[0].slug).toBe('handloom-batik-shirts');
  });

  it('should serve pre-computed hierarchy from Redis with X-Cache HIT on second request', async () => {
    const cachedPayload = [
      {
        id: 1,
        name: 'Men',
        slug: 'men',
        children: [
          { id: 2, name: 'Handloom Batik Shirts', slug: 'handloom-batik-shirts', children: [] },
        ],
      },
    ];

    jest.spyOn(redisClient, 'get').mockResolvedValueOnce(JSON.stringify(cachedPayload));

    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(cachedPayload);
  });
});
