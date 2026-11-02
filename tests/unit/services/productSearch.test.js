jest.mock('../../../src/models', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../src/services/product.service', () => ({
  slugify: (name) => name.toLowerCase().replace(/\s+/g, '-'),
}));

const { sequelize } = require('../../../src/models');
const { suggest, facets, escapeLike } = require('../../../src/services/productSearch.service');

// Refs #188
describe('productSearch service', () => {
  beforeEach(() => sequelize.query.mockReset());

  it('should escape LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('should tidy the query and skip the database for short text', async () => {
    await expect(suggest('  a ')).resolves.toEqual({
      query: 'a',
      products: [],
      categories: [],
      brands: [],
    });
    await expect(suggest(undefined)).resolves.toMatchObject({ query: '' });
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it('should shape products and fill a missing slug', async () => {
    sequelize.query
      .mockResolvedValueOnce([
        { id: 1, name: 'Blue Batik', slug: null, price: '2500.00', primary_image: '/a.jpg' },
      ])
      .mockResolvedValueOnce([{ name: 'Men', slug: 'men' }])
      .mockResolvedValueOnce([]);

    const result = await suggest('  blue    batik  ');

    expect(result.query).toBe('blue batik');
    expect(result.products[0]).toMatchObject({ slug: 'blue-batik', price: 2500 });
    expect(result.categories).toEqual([{ name: 'Men', slug: 'men' }]);
    expect(sequelize.query.mock.calls[0][1].replacements).toMatchObject({
      contains: '%blue batik%',
      starts: 'blue batik%',
    });
  });

  it('should return in-stock colours and sizes', async () => {
    sequelize.query
      .mockResolvedValueOnce([{ name: 'Indigo', count: 3 }])
      .mockResolvedValueOnce([{ size: 'M' }, { size: 'L' }]);

    await expect(facets()).resolves.toEqual({
      colors: [{ name: 'Indigo', count: 3 }],
      sizes: ['M', 'L'],
    });
    expect(sequelize.query.mock.calls[0][0]).toMatch(/COUNT\(DISTINCT v.product_id\)/);
  });
});
