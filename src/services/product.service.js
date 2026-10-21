// ==============================================================================
// Product Service - Product Details with Variant Matrix & Discovery Catalog
// Why this file matters: Serves PDP details with real-time stock availability,
// gallery images, review summaries, and multi-faceted product discovery.
// ==============================================================================

const { Op, Sequelize } = require('sequelize');
const { Product, ProductVariant, ProductImage, Category, Review } = require('../models');

/**
 * Normalizes text to a URL-safe slug.
 *
 * @param {string} text - Raw string
 * @returns {string} URL slug
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

/**
 * Computes available stock from stock and reserved quantities defensively.
 *
 * @param {number} stockQuantity - Physical inventory
 * @param {number} reservedQuantity - Items currently in cart hold
 * @returns {number} Available stock (>= 0)
 */
function calculateAvailableStock(stockQuantity, reservedQuantity) {
  const stock = Number(stockQuantity) || 0;
  const reserved = Number(reservedQuantity) || 0;
  return Math.max(0, stock - reserved);
}

/**
 * Formats a product variant including real-time available stock computation.
 *
 * @param {object} variant - Raw or Sequelize variant
 * @returns {object} Formatted variant with available_stock
 */
function formatVariant(variant) {
  const v = typeof variant.toJSON === 'function' ? variant.toJSON() : variant;
  const stockQuantity = v.stockQuantity ?? v.stock_quantity ?? 0;
  const reservedQuantity = v.reservedQuantity ?? v.reserved_quantity ?? 0;
  const availableStock = calculateAvailableStock(stockQuantity, reservedQuantity);

  return {
    ...v,
    stock_quantity: stockQuantity,
    reserved_quantity: reservedQuantity,
    available_stock: availableStock,
    availableStock,
  };
}

/**
 * Retrieves full product details by SEO slug with eager-loaded variants,
 * gallery images, category information, and review summary statistics.
 *
 * @param {string} slug - Product SEO slug or identifier
 * @returns {Promise<object|null>} Complete product detail or null
 */
const getProductBySlug = async (slug) => {
  if (!slug) return null;

  const whereConditions = [{ slug }];

  // Allow lookup by ID if numeric
  if (!Number.isNaN(Number(slug))) {
    whereConditions.push({ id: Number(slug) });
  }

  // Also allow case-insensitive match on slugified name
  whereConditions.push(
    Sequelize.where(
      Sequelize.fn('LOWER', Sequelize.fn('REPLACE', Sequelize.col('Product.name'), ' ', '-')),
      slug.toLowerCase()
    )
  );

  const product = await Product.findOne({
    where: {
      [Op.or]: whereConditions,
    },
    include: [
      {
        model: ProductVariant,
        as: 'variants',
        include: [
          {
            model: ProductImage,
            as: 'images',
          },
        ],
      },
      {
        model: Category,
        as: 'categoryDetails',
        required: false,
      },
      {
        model: Review,
        as: 'reviews',
        required: false,
      },
    ],
  });

  if (!product) {
    return null;
  }

  const plain = typeof product.toJSON === 'function' ? product.toJSON() : product;

  // Format all variants with real-time stock computation
  const variants = (plain.variants || []).map(formatVariant);

  // Collate and order gallery images by displayOrder ASC
  const galleryImages = [];
  variants.forEach((v) => {
    if (v.images && Array.isArray(v.images)) {
      v.images.forEach((img) => {
        galleryImages.push(img);
      });
    }
  });

  galleryImages.sort(
    (a, b) => (a.displayOrder ?? a.display_order ?? 0) - (b.displayOrder ?? b.display_order ?? 0)
  );

  // If no variant images, add primary image as initial gallery element
  if (galleryImages.length === 0 && plain.primaryImage) {
    galleryImages.push({
      id: 0,
      imageUrl: plain.primaryImage,
      isPrimary: true,
      displayOrder: 0,
    });
  }

  // Calculate review summary statistics
  const reviews = plain.reviews || [];
  const reviewCount = reviews.length;
  const ratingSum = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  const averageRating = reviewCount > 0 ? Number((ratingSum / reviewCount).toFixed(1)) : 0;

  return {
    id: plain.id,
    name: plain.name,
    slug: plain.slug || slugify(plain.name),
    description: plain.description,
    price: plain.price,
    base_price: plain.price,
    material: plain.material,
    care_instructions: plain.careInstructions ?? plain.care_instructions,
    category: plain.categoryDetails || plain.category,
    brand: plain.brand,
    is_final_sale: plain.isFinalSale ?? plain.is_final_sale ?? false,
    primary_image: plain.primaryImage ?? plain.primary_image,
    variants,
    images: galleryImages,
    reviewsSummary: {
      averageRating,
      reviewCount,
    },
    reviews,
  };
};

/**
 * Lists products with faceted filtering and pagination.
 *
 * @param {object} params - Filter and pagination criteria
 * @returns {Promise<{ products: Array<object>, pagination: object }>}
 */
const listProducts = async ({
  categoryId,
  minPrice,
  maxPrice,
  size,
  color,
  sort,
  search,
  page = 1,
  limit = 12,
}) => {
  const productWhere = {};
  const variantWhere = {};

  if (categoryId) {
    let categoryIds = [categoryId];
    try {
      if (Category) {
        const subCategories = await Category.findAll({
          where: { parentId: categoryId, isActive: true },
          attributes: ['id'],
        });
        if (subCategories && subCategories.length > 0) {
          categoryIds = categoryIds.concat(subCategories.map((c) => c.id));
        }
      }
    } catch (e) {
      // Fall back to direct categoryId
    }
    productWhere[Op.or] = [
      { categoryId: { [Op.in]: categoryIds } },
      { category: String(categoryId) },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    productWhere.price = {};
    if (minPrice !== undefined) productWhere.price[Op.gte] = Number(minPrice);
    if (maxPrice !== undefined) productWhere.price[Op.lte] = Number(maxPrice);
  }

  if (search) {
    productWhere[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
    ];
  }

  if (size) {
    variantWhere.size = size;
  }

  if (color) {
    variantWhere.color = color;
  }

  // Ensure available stock > 0 when filtering on variant attributes
  if (size || color) {
    variantWhere[Op.and] = Sequelize.literal(
      '"variants"."stock_quantity" - "variants"."reserved_quantity" > 0'
    );
  }

  const SORT_MAP = {
    price_asc: [['price', 'ASC']],
    price_desc: [['price', 'DESC']],
    newest: [['created_at', 'DESC']],
  };

  const order = SORT_MAP[sort] || [['created_at', 'DESC']];
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 12);
  const offset = (pageNum - 1) * limitNum;

  const { count, rows } = await Product.findAndCountAll({
    where: productWhere,
    include: [
      {
        model: ProductVariant,
        as: 'variants',
        where: Object.keys(variantWhere).length > 0 ? variantWhere : undefined,
        required: Object.keys(variantWhere).length > 0,
        include: [
          {
            model: ProductImage,
            as: 'images',
            required: false,
          },
        ],
      },
      {
        model: Category,
        as: 'categoryDetails',
        required: false,
      },
    ],
    order,
    limit: limitNum,
    offset,
    distinct: true,
  });

  const products = rows.map((p) => {
    const plain = typeof p.toJSON === 'function' ? p.toJSON() : p;
    return {
      id: plain.id,
      name: plain.name,
      slug: plain.slug || slugify(plain.name),
      price: plain.price,
      base_price: plain.price,
      category: plain.categoryDetails?.name || plain.category,
      primary_image: plain.primaryImage ?? plain.primary_image,
      variants: (plain.variants || []).map(formatVariant),
    };
  });

  const totalPages = Math.ceil(count / limitNum);

  return {
    products,
    total: count,
    page: pageNum,
    limit: limitNum,
    totalPages,
    pagination: {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    },
  };
};

module.exports = {
  slugify,
  calculateAvailableStock,
  formatVariant,
  getProductBySlug,
  listProducts,
};
