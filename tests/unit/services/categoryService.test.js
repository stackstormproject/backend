const { buildCategoryTree } = require('../../../src/services/category.service');

describe('categoryService - buildCategoryTree', () => {
  it('should return an empty array given an empty list of categories', () => {
    const tree = buildCategoryTree([]);
    expect(tree).toEqual([]);
  });

  it('should build a hierarchical category tree given flat categories with parentId', () => {
    const flatCategories = [
      { id: 1, name: 'Men', slug: 'men', parentId: null, isActive: true },
      { id: 2, name: 'Casual Wear', slug: 'casual-wear', parentId: 1, isActive: true },
      { id: 3, name: 'Batik Shirts', slug: 'batik-shirts', parentId: 2, isActive: true },
      { id: 4, name: 'Women', slug: 'women', parentId: null, isActive: true },
    ];

    const tree = buildCategoryTree(flatCategories);

    expect(tree).toHaveLength(2);

    const men = tree.find((c) => c.slug === 'men');
    expect(men).toBeDefined();
    expect(men.children).toHaveLength(1);

    const casual = men.children[0];
    expect(casual.slug).toBe('casual-wear');
    expect(casual.children).toHaveLength(1);

    const batik = casual.children[0];
    expect(batik.slug).toBe('batik-shirts');
    expect(batik.children).toHaveLength(0);

    const women = tree.find((c) => c.slug === 'women');
    expect(women).toBeDefined();
    expect(women.children).toHaveLength(0);
  });

  it('should support snake_case parent_id field seamlessly', () => {
    const flatCategories = [
      { id: 10, name: 'Kids', slug: 'kids', parent_id: null, is_active: true },
      { id: 11, name: 'Baby Care', slug: 'baby-care', parent_id: 10, is_active: true },
    ];

    const tree = buildCategoryTree(flatCategories);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].slug).toBe('baby-care');
  });

  it('should gracefully break recursion and avoid stack overflow given a circular parent reference', () => {
    // Category 1 points to 2, and Category 2 points to 1 (Infinite loop hazard)
    const cyclicCategories = [
      { id: 1, name: 'Loop A', slug: 'loop-a', parentId: 2, isActive: true },
      { id: 2, name: 'Loop B', slug: 'loop-b', parentId: 1, isActive: true },
    ];

    // Starting from null, neither is root, so tree is empty without crashing
    const treeNull = buildCategoryTree(cyclicCategories, null);
    expect(treeNull).toEqual([]);

    // Starting explicitly from 1: should not throw RangeError: Maximum call stack size exceeded
    expect(() => {
      buildCategoryTree(cyclicCategories, 1);
    }).not.toThrow();
  });
});
