const request = require('supertest');
const app = require('../../src/app');
const { Product, sequelize } = require('../../src/models');

describe('GET /api/v1/products/:slug - Product Detail API Integration', () => {
  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      await sequelize.close();
    } catch (e) {
      // Ignore
    }
  });

  it('should return 404 given non-existent product slug', async () => {
    jest.spyOn(Product, 'findOne').mockResolvedValue(null);

    const res = await request(app).get('/api/v1/products/non-existent-garment');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Product not found: non-existent-garment');
  });

  it('should return 200 with complete variant matrix and gallery images given valid product slug', async () => {
    const mockProduct = {
      id: 5,
      name: 'Linen Summer Shirt',
      slug: 'linen-summer-shirt',
      description: 'Breathable linen shirt for tropical climates',
      price: '2900.00',
      category: 'Shirts',
      primaryImage: 'https://cdn.example.com/linen-shirt.jpg',
      variants: [
        {
          id: 51,
          sku: 'LINEN-S-WHT',
          size: 'S',
          color: 'White',
          stockQuantity: 12,
          reservedQuantity: 2,
          images: [],
        },
        {
          id: 52,
          sku: 'LINEN-M-WHT',
          size: 'M',
          color: 'White',
          stockQuantity: 0,
          reservedQuantity: 0,
          images: [],
        },
      ],
      reviews: [],
    };

    jest.spyOn(Product, 'findOne').mockResolvedValue(mockProduct);

    const res = await request(app).get('/api/v1/products/linen-summer-shirt');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.slug).toBe('linen-summer-shirt');
    expect(res.body.data.variants).toHaveLength(2);
    expect(res.body.data.variants[0].available_stock).toBe(10);
    expect(res.body.data.variants[1].available_stock).toBe(0);
    expect(res.body.data.images).toHaveLength(1);
    expect(res.body.data.images[0].imageUrl).toBe('https://cdn.example.com/linen-shirt.jpg');
  });
});
