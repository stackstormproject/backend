const { Op } = require('sequelize');
const { listProducts } = require('../../../src/services/product.service');
const { Product, Category } = require('../../../src/models');

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

  it('should filter by search keyword across name and description', async () => {
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 0,
      rows: [],
    });

    await listProducts({ search: 'batik' });

    expect(spy).toHaveBeenCalled();
  });

  it('should filter by categoryId and resolve child categories', async () => {
    jest.spyOn(Category, 'findAll').mockResolvedValue([{ id: 10 }]);
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 0,
      rows: [],
    });

    await listProducts({ categoryId: 1 });

    expect(spy).toHaveBeenCalled();
  });

  it('should support price_asc, price_desc and inStock filter', async () => {
    const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
      count: 0,
      rows: [],
    });

    await listProducts({ sort: 'price_asc', inStock: true });

    expect(spy).toHaveBeenCalled();
    let queryArg = spy.mock.calls[0][0];
    expect(queryArg.order).toEqual([['price', 'ASC']]);

    await listProducts({ sort: 'price_desc' });
    queryArg = spy.mock.calls[1][0];
    expect(queryArg.order).toEqual([['price', 'DESC']]);

    await listProducts({ sort: 'newest' });
    queryArg = spy.mock.calls[2][0];
    expect(queryArg.order).toEqual([['created_at', 'DESC']]);
  });

  describe('Category Slug & Semantic Filtering Branches', () => {
    it('should ignore categoryId when all, null or undefined string', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await listProducts({ categoryId: 'all' });
      await listProducts({ categoryId: 'null' });
      await listProducts({ categoryId: 'undefined' });

      expect(spy).toHaveBeenCalledTimes(3);
      // Only the archived-products filter (#136) remains when no category applies.
      expect(spy.mock.calls[0][0].where).toEqual({ [Op.and]: [{ isActive: true }] });
    });

    it('should handle numeric categoryId with child categories and handle error gracefully', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findAll').mockRejectedValueOnce(new Error('DB failure'));

      await listProducts({ categoryId: '42' });
      expect(spy).toHaveBeenCalled();
    });

    it('should match category slug "men" and subcategory "men-batik-shirts"', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockResolvedValue(null);

      await listProducts({ categoryId: 'men' });
      await listProducts({ categoryId: 'men-batik-shirts' });

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should match category slug "women" and subcategory "women-silk-saris"', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockResolvedValue(null);

      await listProducts({ categoryId: 'women' });
      await listProducts({ categoryId: 'women-silk-saris' });

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should match semantic slugs containing batik, handloom, linen, saree', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockResolvedValue(null);

      await listProducts({ categoryId: 'signature-batik' });
      await listProducts({ categoryId: 'artisan-handloom' });
      await listProducts({ categoryId: 'summer-linen' });
      await listProducts({ categoryId: 'silk-saree' });
      await listProducts({ categoryId: 'silk-sari' });

      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('should match kids and accessories slug prefixes and generic fallback', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockResolvedValue(null);

      await listProducts({ categoryId: 'kids-party-wear' });
      await listProducts({ categoryId: 'accessories-belts' });
      await listProducts({ categoryId: 'custom-unmapped-style' });

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should resolve database category when Category model finds a match with subcategories', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockResolvedValue({ id: 5 });
      jest.spyOn(Category, 'findAll').mockResolvedValue([{ id: 51 }, { id: 52 }]);

      await listProducts({ categoryId: 'footwear' });
      expect(spy).toHaveBeenCalled();
    });

    it('should catch error when Category.findOne fails and proceed to semantic match', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });
      jest.spyOn(Category, 'findOne').mockRejectedValue(new Error('Connection error'));

      await listProducts({ categoryId: 'men' });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Faceted Filters & Row Formatting', () => {
    it('should support individual minPrice and maxPrice filters', async () => {
      const spy = jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

      await listProducts({ minPrice: 1500 });
      await listProducts({ maxPrice: 9000 });

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should format product rows including slug auto-gen, categoryDetails name, and primary_image fallback', async () => {
      jest.spyOn(Product, 'findAndCountAll').mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 1,
            name: 'Handloom Cotton Scarf',
            slug: null,
            price: 1800,
            category: 'Accessories',
            categoryDetails: { name: 'Handcrafted Accessories' },
            primaryImage: null,
            primary_image: 'https://images.example.com/scarf.jpg',
            variants: [
              {
                id: 10,
                sku: 'SCARF-RED',
                size: 'Free Size',
                color: 'Red',
                stockQuantity: 10,
                reservedQuantity: 2,
              },
            ],
          },
        ],
      });

      const res = await listProducts({ page: 1, limit: 10 });
      expect(res.products).toHaveLength(1);
      expect(res.products[0].slug).toBe('handloom-cotton-scarf');
      expect(res.products[0].category).toBe('Handcrafted Accessories');
      expect(res.products[0].primary_image).toBe('https://images.example.com/scarf.jpg');
      expect(res.products[0].variants[0].available_stock).toBe(8);
    });
  });
});
