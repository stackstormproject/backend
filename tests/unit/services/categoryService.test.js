const categoryService = require('../../../src/services/category.service');
const { Category } = require('../../../src/models');
const redisClient = require('../../../src/config/redis');

describe('categoryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildCategoryTree', () => {
    it('should return an empty array given an empty list of categories', () => {
      const tree = categoryService.buildCategoryTree([]);
      expect(tree).toEqual([]);
    });

    it('should build a hierarchical category tree given flat categories with parentId', () => {
      const flatCategories = [
        { id: 1, name: 'Men', slug: 'men', parentId: null, isActive: true },
        { id: 2, name: 'Casual Wear', slug: 'casual-wear', parentId: 1, isActive: true },
        { id: 3, name: 'Batik Shirts', slug: 'batik-shirts', parentId: 2, isActive: true },
        { id: 4, name: 'Women', slug: 'women', parentId: null, isActive: true },
      ];

      const tree = categoryService.buildCategoryTree(flatCategories);

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

      const tree = categoryService.buildCategoryTree(flatCategories);

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].slug).toBe('baby-care');
    });

    it('should gracefully break recursion and avoid stack overflow given a circular parent reference', () => {
      const cyclicCategories = [
        { id: 1, name: 'Loop A', slug: 'loop-a', parentId: 2, isActive: true },
        { id: 2, name: 'Loop B', slug: 'loop-b', parentId: 1, isActive: true },
      ];

      const treeNull = categoryService.buildCategoryTree(cyclicCategories, null);
      expect(treeNull).toEqual([]);

      expect(() => {
        categoryService.buildCategoryTree(cyclicCategories, 1);
      }).not.toThrow();
    });
  });

  describe('getCategoryTree', () => {
    it('should return cached tree with fromCache: true when Redis has data', async () => {
      const mockCached = [{ id: 1, name: 'Men', children: [] }];
      jest.spyOn(redisClient, 'get').mockResolvedValue(JSON.stringify(mockCached));

      const result = await categoryService.getCategoryTree();

      expect(result).toEqual({ data: mockCached, fromCache: true });
    });

    it('should fetch from DB, build tree, and write to Redis when cache misses', async () => {
      jest.spyOn(redisClient, 'get').mockResolvedValue(null);
      const setexSpy = jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');
      jest.spyOn(Category, 'findAll').mockResolvedValue([
        {
          id: 1,
          name: 'Men',
          slug: 'men',
          description: null,
          parentId: null,
          isActive: true,
          sortOrder: 1,
        },
      ]);

      const result = await categoryService.getCategoryTree();

      expect(result.fromCache).toBe(false);
      expect(result.data).toHaveLength(1);
      expect(setexSpy).toHaveBeenCalled();
    });

    it('should gracefully handle Redis read error and fall back to database', async () => {
      jest.spyOn(redisClient, 'get').mockRejectedValue(new Error('Redis connection refused'));
      jest.spyOn(redisClient, 'setex').mockResolvedValue('OK');
      jest.spyOn(Category, 'findAll').mockResolvedValue([]);

      const result = await categoryService.getCategoryTree();

      expect(result.fromCache).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should gracefully handle Redis write error without throwing', async () => {
      jest.spyOn(redisClient, 'get').mockResolvedValue(null);
      jest.spyOn(redisClient, 'setex').mockRejectedValue(new Error('Redis write failed'));
      jest.spyOn(Category, 'findAll').mockResolvedValue([]);

      const result = await categoryService.getCategoryTree();

      expect(result.fromCache).toBe(false);
      expect(result.data).toEqual([]);
    });
  });

  describe('invalidateCache', () => {
    it('should delete the cache key from Redis', async () => {
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);

      await categoryService.invalidateCache();

      expect(delSpy).toHaveBeenCalledWith('cache:categories:tree');
    });

    it('should gracefully handle Redis del failure without throwing', async () => {
      jest.spyOn(redisClient, 'del').mockRejectedValue(new Error('Redis del failed'));

      await expect(categoryService.invalidateCache()).resolves.toBeUndefined();
    });
  });

  describe('createCategory', () => {
    it('should create a category and invalidate cache', async () => {
      const mockCategory = { id: 5, name: 'Shoes' };
      jest.spyOn(Category, 'create').mockResolvedValue(mockCategory);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);

      const created = await categoryService.createCategory({ name: 'Shoes' });

      expect(created).toEqual(mockCategory);
      expect(delSpy).toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    it('should update an existing category and invalidate cache', async () => {
      const mockCategory = {
        id: 1,
        name: 'Old',
        update: jest.fn().mockResolvedValue({ id: 1, name: 'New' }),
      };
      jest.spyOn(Category, 'findByPk').mockResolvedValue(mockCategory);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);

      const updated = await categoryService.updateCategory(1, { name: 'New' });

      expect(mockCategory.update).toHaveBeenCalledWith({ name: 'New' });
      expect(delSpy).toHaveBeenCalled();
      expect(updated).toBe(mockCategory);
    });

    it('should throw 404 ApiError when category to update is not found', async () => {
      jest.spyOn(Category, 'findByPk').mockResolvedValue(null);

      await expect(categoryService.updateCategory(999, { name: 'New' })).rejects.toThrow(
        'Category not found with id: 999'
      );
    });
  });

  describe('deleteCategory', () => {
    it('should destroy existing category and invalidate cache', async () => {
      const mockCategory = {
        id: 1,
        destroy: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Category, 'findByPk').mockResolvedValue(mockCategory);
      const delSpy = jest.spyOn(redisClient, 'del').mockResolvedValue(1);

      const result = await categoryService.deleteCategory(1);

      expect(mockCategory.destroy).toHaveBeenCalled();
      expect(delSpy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw 404 ApiError when category to delete is not found', async () => {
      jest.spyOn(Category, 'findByPk').mockResolvedValue(null);

      await expect(categoryService.deleteCategory(999)).rejects.toThrow(
        'Category not found with id: 999'
      );
    });
  });
});
