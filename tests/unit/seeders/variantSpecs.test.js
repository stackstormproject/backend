jest.mock('../../../src/models', () => ({}));

const {
  variantSpecsFor,
  toCategoryAttributes,
} = require('../../../src/seeders/seedCategoriesAndProducts');

// Refs #107: every product needs purchasable variants with unique SKU codes.
describe('variantSpecsFor', () => {
  it('should give apparel S to XL with an XL surcharge', () => {
    const specs = variantSpecsFor({ name: 'Linen Shirt', category: 'Shirts' });

    expect(specs.map((s) => s.size)).toEqual(['S', 'M', 'L', 'XL']);
    expect(specs.find((s) => s.size === 'XL').surcharge).toBe(250);
  });

  it('should give a saree a single free-size variant', () => {
    expect(variantSpecsFor({ name: 'Silk Saree', category: 'Saris' })).toEqual([
      expect.objectContaining({ size: 'Free Size' }),
    ]);
  });

  it('should give accessories a single one-size variant', () => {
    expect(variantSpecsFor({ name: 'Shawl', category: 'Accessories' })[0].size).toBe('One Size');
  });

  it('should use unique codes within a product', () => {
    const codes = variantSpecsFor({ name: 'Tee', category: 'T-Shirts' }).map((s) => s.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('toCategoryAttributes', () => {
  it('should map snake_case seed keys to model attributes', () => {
    expect(
      toCategoryAttributes({ id: 11, name: 'Batik', slug: 'b', parent_id: 1, sort_order: 2 })
    ).toMatchObject({ parentId: 1, sortOrder: 2, isActive: true });
  });
});
