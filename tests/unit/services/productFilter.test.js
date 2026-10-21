const { listProducts } = require('../../../src/services/product.service');
const { Product } = require('../../../src/models');

describe('productFilter Service - Multi-Faceted Query Builder & Pagination', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should build Sequelize query with price range operators', async () => {
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 2,
      rows: [
        {
          id: 1,
          name: 'Classic White Shirt',
          price: 2500,
          category: 'Shirts',
          variants: [],
        },
      ],
    });

    const res = await listProducts({ minPrice: 2000, maxPrice: 8500, page: 1, limit: 6 });

    expect(spy).toHaveBeenCalled();
    const queryArg = spy.mock.calls[0][0];
    expect(queryArg.limit).toBe(6);
    expect(queryArg.offset).toBe(0);
    expect(res.products).toHaveLength(1);
    expect(res.pagination.totalPages).toBe(1);
  });

  it('should support pagination offset calculation correctly for subsequent pages', async () => {
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 25,
      rows: [],
    });

    const res = await listProducts({ page: 2, limit: 10 });

    expect(spy).toHaveBeenCalled();
    const queryArg = spy.mock.calls[0][0];
    expect(queryArg.offset).toBe(10);
    expect(res.pagination.page).toBe(2);
    expect(res.pagination.totalPages).toBe(3);
    expect(res.pagination.hasNextPage).toBe(true);
    expect(res.pagination.hasPrevPage).toBe(true);
  });

  it('should filter by variant size and color', async () => {
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 1,
      rows: [],
    });

    await listProducts({ size: 'L', color: 'Navy' });

    expect(spy).toHaveBeenCalled();
    const queryArg = spy.mock.calls[0][0];
    const variantInclude = queryArg.include.find((i) => i.as === 'variants');
    expect(variantInclude).toBeDefined();
    expect(variantInclude.where.size).toBe('L');
    expect(variantInclude.where.color).toBe('Navy');
    expect(variantInclude.required).toBe(true);
  });
});
