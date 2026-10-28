jest.mock('../../../src/models', () => ({
  Brand: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
  Product: { update: jest.fn() },
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../../src/services/product.service', () => ({
  slugify: (text) =>
    String(text)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, ''),
}));

const { UniqueConstraintError } = require('sequelize');
const { Brand, Product, sequelize } = require('../../../src/models');
const service = require('../../../src/services/brand.service');

// Refs #173: brand rules at unit level (database behaviour in tests/integration/brands.test.js).
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const brand = (overrides = {}) => ({
  id: 1,
  name: 'Dickwella Atelier',
  slug: 'dickwella-atelier',
  tagline: null,
  logoUrl: null,
  isFeatured: true,
  sortOrder: 0,
  update: jest.fn(function update(fields) {
    Object.assign(this, fields);
  }),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  sequelize.transaction.mockImplementation((cb) => cb(transaction));
  sequelize.query.mockResolvedValue([{ brand: 'Dickwella Atelier', count: 8 }]);
});

describe('brandService.listPublicBrands', () => {
  it('should hide brands without products and add product counts', async () => {
    Brand.findAll.mockResolvedValue([brand(), brand({ id: 2, name: 'Empty' })]);

    const result = await service.listPublicBrands();

    expect(result).toEqual([expect.objectContaining({ id: 1, product_count: 8 })]);
    expect(Brand.findAll.mock.calls[0][0].where).toEqual({ isFeatured: true });
  });
});

describe('brandService.listBrands', () => {
  it('should list every brand for staff', async () => {
    Brand.findAll.mockResolvedValue([brand(), brand({ id: 2, name: 'Empty' })]);

    const result = await service.listBrands();

    expect(result.map((b) => b.product_count)).toEqual([8, 0]);
  });
});

describe('brandService.createBrand', () => {
  it.each([
    [{}],
    [{ name: 'x' }],
    [{ name: 'Ok', sort_order: -1 }],
    [{ name: 'Ok', sort_order: 1.5 }],
  ])('should reject %p', async (body) => {
    await expect(service.createBrand(body)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject a logo that is not a link or an upload', async () => {
    await expect(
      service.createBrand({ name: 'Loom', logo_url: '/api/v1/media/../x.png' })
    ).rejects.toMatchObject({ message: expect.stringMatching(/Logo/) });
  });

  it('should save trimmed fields with a slug', async () => {
    Brand.create.mockImplementation(async (fields) => brand({ id: 3, ...fields }));

    const result = await service.createBrand({
      name: '  Loom House ',
      tagline: ' Woven ',
      logo_url: 'https://cdn.example/logo.png',
      is_featured: 0,
      sort_order: '4',
    });

    expect(Brand.create).toHaveBeenCalledWith({
      name: 'Loom House',
      slug: 'loom-house',
      tagline: 'Woven',
      logoUrl: 'https://cdn.example/logo.png',
      isFeatured: false,
      sortOrder: 4,
    });
    expect(result).toMatchObject({ id: 3, product_count: 0 });
  });

  it('should report a duplicate name as a conflict', async () => {
    Brand.create.mockRejectedValue(new UniqueConstraintError({ errors: [] }));

    await expect(service.createBrand({ name: 'Loom' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should pass other errors through', async () => {
    Brand.create.mockRejectedValue(new Error('db down'));

    await expect(service.createBrand({ name: 'Loom' })).rejects.toThrow('db down');
  });
});

describe('brandService.updateBrand', () => {
  it('should return 404 for a missing brand', async () => {
    Brand.findByPk.mockResolvedValue(null);

    await expect(service.updateBrand(9, { tagline: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('should rename the brand on its products in the same transaction', async () => {
    const row = brand();
    Brand.findByPk.mockResolvedValue(row);
    sequelize.query.mockResolvedValue([{ brand: 'Atelier', count: 8 }]);

    const result = await service.updateBrand(1, { name: 'Atelier' });

    expect(Product.update).toHaveBeenCalledWith(
      { brand: 'Atelier' },
      { where: { brand: 'Dickwella Atelier' }, transaction }
    );
    expect(result).toMatchObject({ name: 'Atelier', product_count: 8 });
  });

  it('should leave products alone when the name is unchanged', async () => {
    Brand.findByPk.mockResolvedValue(brand());

    await service.updateBrand(1, { tagline: '', logo_url: '' });

    expect(Product.update).not.toHaveBeenCalled();
  });
});

describe('brandService.deleteBrand', () => {
  it('should delete a brand and 404 when it is gone', async () => {
    Brand.destroy.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await service.deleteBrand(1);
    await expect(service.deleteBrand(1)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('brandService.brandNameFor', () => {
  it('should map a slug to the brand name and keep unknown names', async () => {
    Brand.findOne.mockResolvedValueOnce(brand()).mockResolvedValueOnce(null);

    await expect(service.brandNameFor('dickwella-atelier')).resolves.toBe('Dickwella Atelier');
    await expect(service.brandNameFor(' Other ')).resolves.toBe('Other');
    await expect(service.brandNameFor('')).resolves.toBeNull();
  });
});
