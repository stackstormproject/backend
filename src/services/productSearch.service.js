// ==============================================================================
// Search suggestions and filter facets for the shop (#188, FR-001, FR-002).
// Suggestions rank names that start with the typed text first, then names that
// contain it, then description, brand and category matches.
// ==============================================================================

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { slugify } = require('./product.service');

const MIN_QUERY = 2;
const MAX_QUERY = 60;
const PRODUCT_LIMIT = 6;

/** Escapes LIKE wildcards so "50%" searches for the text, not a pattern. */
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const normalise = (q) =>
  String(q ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY);

/**
 * Products, categories and brands matching what the shopper is typing.
 * @returns {Promise<{ query: string, products: object[], categories: object[], brands: object[] }>}
 */
const suggest = async (rawQuery) => {
  const query = normalise(rawQuery);
  const empty = { query, products: [], categories: [], brands: [] };
  if (query.length < MIN_QUERY) return empty;

  const contains = `%${escapeLike(query)}%`;
  const starts = `${escapeLike(query)}%`;
  const replacements = { contains, starts, limit: PRODUCT_LIMIT };

  const [products, categories, brands] = await Promise.all([
    sequelize.query(
      `SELECT p.id, p.name, p.slug, p.price, p.primary_image, p.brand,
              COALESCE(c.name, p.category) AS category,
              CASE WHEN p.name ILIKE :starts THEN 0
                   WHEN p.name ILIKE :contains THEN 1
                   WHEN p.brand ILIKE :contains THEN 2
                   ELSE 3 END AS rank
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true
          AND (p.name ILIKE :contains OR p.description ILIKE :contains
               OR p.brand ILIKE :contains OR p.category ILIKE :contains OR c.name ILIKE :contains)
        ORDER BY rank, p.name
        LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT name, slug FROM categories
        WHERE is_active = true AND name ILIKE :contains
        ORDER BY (name ILIKE :starts) DESC, name LIMIT 3`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT name, slug FROM brands
        WHERE name ILIKE :contains
          AND EXISTS (SELECT 1 FROM products p WHERE p.brand = brands.name AND p.is_active = true)
        ORDER BY name LIMIT 3`,
      { type: QueryTypes.SELECT, replacements }
    ),
  ]);

  return {
    query,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug || slugify(p.name),
      price: Number(p.price),
      primary_image: p.primary_image,
      brand: p.brand,
      category: p.category,
    })),
    categories,
    brands,
  };
};

/**
 * Colours and sizes that are in stock on active products, for the shop's filters.
 * @returns {Promise<{ colors: {name: string, count: number}[], sizes: string[] }>}
 */
const facets = async () => {
  const inStock = `FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.is_active = true
      WHERE v.stock_quantity - v.reserved_quantity > 0`;
  const [colorRows, sizeRows] = await Promise.all([
    sequelize.query(
      `SELECT TRIM(v.color) AS name, COUNT(DISTINCT v.product_id)::int AS count ${inStock}
          AND TRIM(COALESCE(v.color, '')) <> ''
        GROUP BY TRIM(v.color) ORDER BY TRIM(v.color)`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(`SELECT DISTINCT v.size AS size ${inStock} AND v.size IS NOT NULL`, {
      type: QueryTypes.SELECT,
    }),
  ]);
  return { colors: colorRows, sizes: sizeRows.map((r) => r.size) };
};

module.exports = { suggest, facets, escapeLike, MIN_QUERY };
