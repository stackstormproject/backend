// ==============================================================================
// Category Domain Service - Recursive Hierarchy Assembly & Cache Management
// Why this file matters: Assembles parent-child category trees, guards against
// circular recursion crashes, and manages Redis caching with automatic invalidation.
// ==============================================================================

const { Category } = require('../models');
const redisClient = require('../config/redis');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const cacheService = require('./cache.service');

const CACHE_KEY = 'cache:categories:tree';
const CACHE_TTL_SECONDS = 86400; // 24 hours

/**
 * Recursively constructs a nested category hierarchy tree from a flat category array.
 * Employs a visited Set to guard against circular parent references.
 *
 * @param {Array<object>} categories - Flat array of category objects from DB
 * @param {number|string|null} [parentId=null] - Current parent ID to filter children on
 * @param {Set<string|number>} [visited=new Set()] - Set of already processed category IDs
 * @returns {Array<object>} Nested hierarchical category tree
 */
const buildCategoryTree = (categories, parentId = null, visited = new Set()) => {
  const result = [];
  const currentVisited = new Set(visited);

  if (parentId !== null && parentId !== undefined) {
    currentVisited.add(parentId);
  }

  categories.forEach((cat) => {
    const rawParentId = cat.parentId !== undefined ? cat.parentId : cat.parent_id;
    const catParentId = rawParentId ?? null;

    if (catParentId === parentId) {
      if (currentVisited.has(cat.id)) {
        logger.warn(
          `[CATEGORY TREE] Circular reference detected in category hierarchy for id: ${cat.id}`
        );
      } else {
        const nextVisited = new Set(currentVisited);
        nextVisited.add(cat.id);

        const plain = typeof cat.toJSON === 'function' ? cat.toJSON() : cat;

        result.push({
          id: plain.id,
          name: plain.name,
          slug: plain.slug,
          description: plain.description,
          parentId: catParentId,
          isActive: plain.isActive !== undefined ? plain.isActive : (plain.is_active ?? true),
          sortOrder: plain.sortOrder ?? plain.sort_order ?? 0,
          children: buildCategoryTree(categories, plain.id, nextVisited),
        });
      }
    }
  });

  return result;
};

/**
 * Retrieves the complete category tree with Redis caching and diagnostic flags.
 *
 * @returns {Promise<{ data: Array<object>, fromCache: boolean }>}
 */
const getCategoryTree = async () => {
  // Step 1: Check Redis cache
  try {
    const cachedTree = await redisClient.get(CACHE_KEY);
    if (cachedTree) {
      const parsed = JSON.parse(cachedTree);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          data: parsed,
          fromCache: true,
        };
      }
    }
  } catch (cacheErr) {
    logger.warn(
      `[CATEGORY] Redis cache read failed, falling back to database: ${cacheErr.message}`
    );
  }

  // Step 2: Query database on cache miss or Redis offline
  const categories = await Category.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });

  // Step 3: Recursively assemble hierarchy tree
  const tree = buildCategoryTree(categories, null);

  // Step 4: Populate Redis cache
  try {
    await redisClient.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(tree));
  } catch (cacheErr) {
    logger.warn(`[CATEGORY] Failed to write category tree to Redis: ${cacheErr.message}`);
  }

  return {
    data: tree,
    fromCache: false,
  };
};

/**
 * Invalidates the category tree cache in Redis.
 */
const invalidateCache = async () => {
  try {
    await redisClient.del(CACHE_KEY);
    await cacheService.invalidateCategoryCache();
    logger.info('[CATEGORY] Redis category cache invalidated successfully');
  } catch (err) {
    logger.warn(`[CATEGORY] Failed to invalidate Redis category cache: ${err.message}`);
  }
};

/**
 * Creates a new category and clears stale cache.
 */
const createCategory = async (data) => {
  const category = await Category.create(data);
  await invalidateCache();
  return category;
};

/**
 * Updates an existing category and clears stale cache.
 */
const updateCategory = async (id, data) => {
  const category = await Category.findByPk(id);
  if (!category) {
    throw ApiError.notFound(`Category not found with id: ${id}`);
  }

  await category.update(data);
  await invalidateCache();
  return category;
};

/**
 * Deletes a category and clears stale cache.
 */
const deleteCategory = async (id) => {
  const category = await Category.findByPk(id);
  if (!category) {
    throw ApiError.notFound(`Category not found with id: ${id}`);
  }

  await category.destroy();
  await invalidateCache();
  return true;
};

module.exports = {
  buildCategoryTree,
  getCategoryTree,
  invalidateCache,
  createCategory,
  updateCategory,
  deleteCategory,
};
