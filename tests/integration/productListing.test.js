const request = require('supertest');
const app = require('../../src/app');
const { Product, sequelize } = require('../../src/models');

describe('GET /api/v1/products - Faceted Listing & Pagination Integration', () => {
  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      await sequelize.close();
    } catch (e) {
      // Ignore
    }
  });

  it('should return 200 with paginated product array given price range filter', async () => {
    jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 2,
      rows: [
        {
          id: 1,
          name: 'Classic White Shirt',
          slug: 'classic-white-shirt',
          price: '2500.00',
          category: 'Shirts',
          primaryImage: 'https://example.com/shirt1.jpg',
          variants: [
            {
              id: 11,
              size: 'M',
              color: 'White',
              stockQuantity: 10,
              reservedQuantity: 2,
            },
          ],
        },
        {
          id: 2,
          name: 'Slim Fit Chinos',
          slug: 'slim-fit-chinos',
          price: '3800.00',
          category: 'Pants',
          primaryImage: 'https://example.com/chinos1.jpg',
          variants: [
            {
              id: 12,
              size: 'M',
              color: 'Khaki',
              stockQuantity: 5,
              reservedQuantity: 0,
            },
          ],
        },
      ],
    });

    const res = await request(app).get('/api/v1/products?min_price=2000&max_price=10000&size=M');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.products).toHaveLength(2);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.products[0].variants[0].available_stock).toBe(8);
  });
});
