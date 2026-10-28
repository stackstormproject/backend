jest.mock('../../../src/models', () => ({
  Product: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
  ProductVariant: { create: jest.fn(), findOne: jest.fn(), count: jest.fn() },
  ProductImage: {},
  Category: { findByPk: jest.fn() },
  Review: {},
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../../src/services/cache.service', () => ({
  invalidateProductCache: jest.fn(),
}));

const { Op, UniqueConstraintError } = require('sequelize');
const { Product, ProductVariant, Category, sequelize } = require('../../../src/models');
const cacheService = require('../../../src/services/cache.service');
const service = require('../../../src/services/adminProduct.service');

// Refs #136: catalogue management rules (unit level; database constraints and the archive
// flow are covered by tests/integration/admin/productManagement.test.js).
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const variant = (overrides = {}) => ({
  id: 21,
  sku: 'DFC-5-M',
  size: 'M',
  color: null,
  additionalPrice: '0.00',
  stockQuantity: 4,
  reservedQuantity: 1,
  update: jest.fn(),
  destroy: jest.fn(),
  ...overrides,
});
const product = (overrides = {}) => ({
  id: 5,
  name: 'Storm Hoodie',
  slug: 'storm-hoodie',
  price: '4500.00',
  categoryId: 2,
  category: 'Apparel',
  categoryDetails: { name: 'Apparel' },
  isFinalSale: false,
  isActive: true,
  variants: [variant({ id: 22, size: 'L' }), variant()],
  update: jest.fn(),
  destroy: jest.fn(),
  ...overrides,
});
const usage = (rows) => sequelize.query.mockResolvedValueOnce(rows);
const uniqueError = () => new UniqueConstraintError({ errors: [] });

beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
  cacheService.invalidateProductCache.mockResolvedValue();
  sequelize.query.mockResolvedValue([]);
});

describe('adminProductService.skuFor', () => {
  it('should build an upper-case SKU from product, size and colour', () => {
    expect(service.skuFor(5, { size: 'xl', color: 'Navy Blue' })).toBe('DFC-5-XL-NAVYBLUE');
    expect(service.skuFor(5, { size: 'M', color: null })).toBe('DFC-5-M');
  });
});

describe('adminProductService.listProducts', () => {
  it('should map products with sorted variants and default paging', async () => {
    Product.findAndCountAll.mockResolvedValue({ count: 1, rows: [product()] });

    const result = await service.listProducts();

    expect(result.products[0]).toMatchObject({
      id: 5,
      price: 4500,
      category_name: 'Apparel',
      total_available: 6,
    });
    expect(result.products[0].variants.map((v) => v.id)).toEqual([21, 22]);
    expect(result.products[0].variants[0]).toMatchObject({ in_use: false, available: 3 });
    expect(result.pagination).toEqual({ total: 1, page: 1, limit: 20, total_pages: 1 });
  });

  it('should filter by name, status and category', async () => {
    Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await service.listProducts({
      search: 'hood',
      status: 'archived',
      category_id: '2',
      limit: '500',
    });
    await service.listProducts({ status: 'active' });

    const [first, second] = Product.findAndCountAll.mock.calls.map((c) => c[0]);
    expect(first.where).toEqual({ name: { [Op.iLike]: '%hood%' }, isActive: false, categoryId: 2 });
    expect(first.limit).toBe(100);
    expect(second.where).toEqual({ isActive: true });
  });

  it('should fall back to the legacy category text and a plain object', async () => {
    Product.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        { get: () => product({ categoryDetails: null, variants: undefined }) },
        product({ categoryDetails: null, category: null, variants: [] }),
      ],
    });

    const { products } = await service.listProducts();

    expect(products[0]).toMatchObject({ category_name: 'Apparel', variants: [] });
    expect(products[1].category_name).toBeNull();
  });
});

describe('adminProductService.getProduct', () => {
  it('should return 404 for a missing product', async () => {
    Product.findByPk.mockResolvedValue(null);

    await expect(service.getProduct(5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should flag variants that have orders or holds', async () => {
    Product.findByPk.mockResolvedValue(product());
    usage([
      { id: 21, orders: 1, holds: 0 },
      { id: 22, orders: 0, holds: 0 },
    ]);

    const result = await service.getProduct(5);

    expect(result.variants.map((v) => v.in_use)).toEqual([true, false]);
  });

  it('should skip the usage query when there are no variants', async () => {
    Product.findByPk.mockResolvedValue(product({ variants: [] }));

    await service.getProduct(5);

    expect(sequelize.query).not.toHaveBeenCalled();
  });
});

describe('adminProductService.createProduct', () => {
  const body = (overrides = {}) => ({
    name: '  Storm Hoodie ',
    price: '4500',
    variants: [{ size: 'M', stock_quantity: 3 }, { size: 'L' }],
    ...overrides,
  });

  beforeEach(() => {
    Product.findAll.mockResolvedValue([]);
    Product.create.mockResolvedValue({ id: 5 });
    ProductVariant.create.mockImplementation(async (fields) => ({ id: 30, ...fields }));
    Product.findByPk.mockResolvedValue(product());
  });

  it('should require between 1 and 30 variants', async () => {
    await expect(service.createProduct(body({ variants: [] }))).rejects.toMatchObject({
      message: 'Add at least one size',
    });
    await expect(service.createProduct(body({ variants: 'x' }))).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.createProduct(body({ variants: Array(31).fill({ size: 'M' }) }))
    ).rejects.toMatchObject({ message: 'At most 30 variants' });
  });

  it.each([
    [{ name: 'x' }, /Name/],
    [{ price: 0 }, /Price/],
    [{ price: 'abc' }, /Price/],
    [{ price: 2000000 }, /Price/],
    [{ primary_image: 'ftp://cdn.example/h.jpg' }, /http/],
    [{ category_id: 99 }, /Category 99/],
  ])('should reject invalid product fields %p', async (overrides, message) => {
    Category.findByPk.mockResolvedValue(null);

    await expect(service.createProduct(body(overrides))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(message),
    });
  });

  it.each([
    [{ size: ' ' }, /size/],
    [{ size: 'M', stock_quantity: -1 }, /Opening stock/],
    [{ size: 'M', stock_quantity: 1.5 }, /Opening stock/],
    [{ size: 'M', additional_price: -5 }, /Extra price/],
  ])('should reject an invalid variant %p', async (bad, message) => {
    await expect(service.createProduct(body({ variants: [bad] }))).rejects.toMatchObject({
      message: expect.stringMatching(message),
    });
  });

  it('should create the product with a unique slug, variants and opening stock logs', async () => {
    Product.findAll.mockResolvedValue([{ slug: 'storm-hoodie' }, { slug: 'storm-hoodie-2' }]);
    Category.findByPk.mockResolvedValue({ id: 2, name: 'Apparel' });

    await service.createProduct(
      body({
        description: ' Warm ',
        care_instructions: 'Cold wash',
        brand: '',
        is_final_sale: 1,
        is_active: 0,
        primary_image: 'https://cdn.example/h.jpg',
        category_id: '2',
      }),
      1
    );

    expect(Product.create).toHaveBeenCalledWith(
      {
        name: 'Storm Hoodie',
        price: 4500,
        description: 'Warm',
        brand: null,
        careInstructions: 'Cold wash',
        isFinalSale: true,
        isActive: false,
        primaryImage: 'https://cdn.example/h.jpg',
        categoryId: 2,
        category: 'Apparel',
        slug: 'storm-hoodie-3',
      },
      { transaction }
    );
    expect(ProductVariant.create).toHaveBeenCalledTimes(2);
    expect(ProductVariant.create.mock.calls[0][0]).toMatchObject({
      productId: 5,
      sku: 'DFC-5-M',
      stockQuantity: 3,
      additionalPrice: 0,
    });
    const logs = sequelize.query.mock.calls.filter(([sql]) => sql.includes('inventory_logs'));
    expect(logs).toHaveLength(1);
    expect(logs[0][1].replacements).toEqual({ variantId: 30, adminId: 1, change: 3 });
    expect(cacheService.invalidateProductCache).toHaveBeenCalledWith(5);
  });

  it('should use the base slug when free and clear an empty category', async () => {
    Product.findAll.mockResolvedValue([{ slug: 'storm-hoodie-2' }]);

    await service.createProduct(body({ category_id: '' }));

    expect(Product.create.mock.calls[0][0]).toMatchObject({
      slug: 'storm-hoodie',
      categoryId: null,
      category: null,
    });
  });

  it('should fall back to "product" for a name without slug characters', async () => {
    await service.createProduct(body({ name: '!!!' }));

    expect(Product.create.mock.calls[0][0].slug).toBe('product');
  });

  it('should report a duplicate size as a conflict', async () => {
    ProductVariant.create.mockRejectedValue(uniqueError());

    await expect(
      service.createProduct(body({ variants: [{ size: 'M', color: 'Black' }] }))
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/M \/ Black/) });
  });

  it('should pass other database errors through', async () => {
    ProductVariant.create.mockRejectedValue(new Error('db down'));

    await expect(service.createProduct(body())).rejects.toThrow('db down');
  });

  it('should not fail when the cache cannot be cleared', async () => {
    cacheService.invalidateProductCache.mockRejectedValue(new Error('redis down'));

    await expect(service.createProduct(body())).resolves.toMatchObject({ id: 5 });
  });
});

describe('adminProductService.updateProduct', () => {
  it('should return 404 for a missing product', async () => {
    Product.findByPk.mockResolvedValue(null);

    await expect(service.updateProduct(5, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should write only the fields sent and keep the slug', async () => {
    const row = product();
    Product.findByPk.mockResolvedValue(row);

    await service.updateProduct(5, { price: '3999.999', material: 'Cotton' });

    expect(row.update).toHaveBeenCalledWith({ price: 4000, material: 'Cotton' });
    expect(cacheService.invalidateProductCache).toHaveBeenCalledWith(5, 'storm-hoodie');
  });
});

describe('adminProductService.addVariant', () => {
  it('should return 404 for a missing product', async () => {
    Product.findByPk.mockResolvedValue(null);

    await expect(service.addVariant(5, { size: 'S' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should add a size without opening stock', async () => {
    Product.findByPk.mockResolvedValue(product());
    ProductVariant.create.mockResolvedValue({ id: 40 });

    await service.addVariant(5, { size: 'S' }, 1);

    expect(ProductVariant.create.mock.calls[0][0]).toMatchObject({ size: 'S', stockQuantity: 0 });
    expect(sequelize.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });
});

describe('adminProductService.updateVariant', () => {
  beforeEach(() => Product.findByPk.mockResolvedValue(product()));

  it('should return 404 for a variant of another product', async () => {
    ProductVariant.findOne.mockResolvedValue(null);

    await expect(service.updateVariant(5, 99, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should change only the extra price without checking usage', async () => {
    const row = variant();
    ProductVariant.findOne.mockResolvedValue(row);

    await service.updateVariant(5, 21, { additional_price: '250', size: 'M' });

    expect(row.update).toHaveBeenCalledWith({ size: 'M', additionalPrice: 250 });
  });

  it('should refuse to rename a size that has been ordered', async () => {
    ProductVariant.findOne.mockResolvedValue(variant());
    usage([{ id: 21, orders: 2, holds: 0 }]);

    await expect(service.updateVariant(5, 21, { size: 'XL' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('should rename an unused size and rebuild its SKU', async () => {
    const row = variant({ color: 'Red' });
    ProductVariant.findOne.mockResolvedValue(row);
    usage([{ id: 21, orders: 0, holds: 0 }]);

    await service.updateVariant(5, 21, { size: 'XL' });
    await service.updateVariant(5, 21, { color: 'Blue' });

    expect(row.update.mock.calls[0][0]).toEqual({ size: 'XL', sku: 'DFC-5-XL-RED' });
    expect(row.update.mock.calls[1][0]).toEqual({ color: 'Blue', sku: 'DFC-5-M-BLUE' });
  });

  it('should report a size and colour that already exist', async () => {
    const row = variant();
    row.update.mockRejectedValue(uniqueError());
    ProductVariant.findOne.mockResolvedValue(row);

    await expect(service.updateVariant(5, 21, { additional_price: 1 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('should pass other update errors through', async () => {
    const row = variant();
    row.update.mockRejectedValue(new Error('db down'));
    ProductVariant.findOne.mockResolvedValue(row);

    await expect(service.updateVariant(5, 21, {})).rejects.toThrow('db down');
  });
});

describe('adminProductService.removeVariant', () => {
  it('should refuse to delete a size in use', async () => {
    ProductVariant.findOne.mockResolvedValue(variant());
    usage([{ id: 21, orders: 0, holds: 1 }]);

    await expect(service.removeVariant(5, 21)).rejects.toMatchObject({ statusCode: 409 });
    expect(ProductVariant.findOne.mock.calls[0][0].lock).toBe('UPDATE');
  });

  it('should keep the last size', async () => {
    ProductVariant.findOne.mockResolvedValue(variant());
    ProductVariant.count.mockResolvedValue(1);

    await expect(service.removeVariant(5, 21)).rejects.toMatchObject({
      message: 'A product needs at least one size',
    });
  });

  it('should delete an unused size with its setup logs', async () => {
    const row = variant();
    ProductVariant.findOne.mockResolvedValue(row);
    ProductVariant.count.mockResolvedValue(2);
    Product.findByPk.mockResolvedValueOnce(null).mockResolvedValue(product());

    await service.removeVariant(5, 21);

    expect(sequelize.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(true);
    expect(row.destroy).toHaveBeenCalledWith({ transaction });
    expect(cacheService.invalidateProductCache).toHaveBeenCalledWith(5, undefined);
  });
});

describe('adminProductService.deleteProduct', () => {
  it('should return 404 for a missing product', async () => {
    Product.findByPk.mockResolvedValue(null);

    await expect(service.deleteProduct(5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should refuse to delete a product with orders', async () => {
    Product.findByPk.mockResolvedValue(product());
    usage([{ id: 21, orders: 1, holds: 0 }]);

    await expect(service.deleteProduct(5)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should delete a never-ordered product and clear its cache', async () => {
    const row = product();
    Product.findByPk.mockResolvedValue(row);

    await service.deleteProduct(5);

    expect(row.destroy).toHaveBeenCalledWith({ transaction });
    expect(cacheService.invalidateProductCache).toHaveBeenCalledWith(5, 'storm-hoodie');
  });

  it('should skip the log cleanup for a product without sizes', async () => {
    Product.findByPk.mockResolvedValue(product({ variants: [] }));

    await service.deleteProduct(5);

    expect(sequelize.query).not.toHaveBeenCalled();
  });
});
