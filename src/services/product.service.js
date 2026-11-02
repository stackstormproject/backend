// ==============================================================================
// Product Service - Product Details with Variant Matrix & Discovery Catalog
// Why this file matters: Serves PDP details with real-time stock availability,
// gallery images, review summaries, and multi-faceted product discovery.
// ==============================================================================

const { Op, Sequelize } = require('sequelize');
const { Product, ProductVariant, ProductImage, Category, Review } = require('../models');
const cacheService = require('./cache.service');

/**
 * Normalizes text to a URL-safe slug.
 *
 * @param {string} text - Raw string
 * @returns {string} URL slug
 */
/**
 * Computes the sale price from a product's list price and discount percentage (Sprint 13).
 * A null, zero or negative percentage means the product is not on sale.
 *
 * @param {number} price - List price
 * @param {number|null} discountPercentage
 * @returns {{isOnSale: boolean, salePrice: number|null}}
 */
function applySale(price, discountPercentage) {
  const pct = Number(discountPercentage);
  if (!pct || pct <= 0) return { isOnSale: false, salePrice: null };
  const clamped = Math.min(pct, 90);
  const base = Number(price) || 0;
  const salePrice = Number((base * (1 - clamped / 100)).toFixed(2));
  return { isOnSale: true, salePrice };
}

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
 * Fetches full product details from PostgreSQL database.
 *
 * @param {string} slug - Product SEO slug or identifier
 * @returns {Promise<object|null>} Complete product detail or null
 */
const fetchProductDetailFromDb = async (slug) => {
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
      isActive: true,
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

  // The main image and up to three extra product images come first (#172), then any
  // variant-specific images; the same picture is never listed twice.
  const productImages = [plain.primaryImage, ...(plain.galleryImages || [])]
    .filter(Boolean)
    .map((imageUrl, index) => ({
      id: -(index + 1),
      imageUrl,
      isPrimary: index === 0,
      displayOrder: index,
    }));
  const seen = new Set(productImages.map((img) => img.imageUrl));
  galleryImages.forEach((img) => {
    const url = img.imageUrl ?? img.image_url;
    if (!seen.has(url)) {
      seen.add(url);
      productImages.push(img);
    }
  });

  // Calculate review summary statistics
  const reviews = plain.reviews || [];
  const reviewCount = reviews.length;
  const ratingSum = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  const averageRating = reviewCount > 0 ? Number((ratingSum / reviewCount).toFixed(1)) : 0;

  const sale = applySale(plain.price, plain.discountPercentage);
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
    is_on_sale: sale.isOnSale,
    discount_percentage: sale.isOnSale ? Number(plain.discountPercentage) : null,
    sale_price: sale.salePrice,
    primary_image: plain.primaryImage ?? plain.primary_image,
    gallery_images: plain.galleryImages || [],
    variants,
    images: productImages,
    reviewsSummary: {
      averageRating,
      reviewCount,
    },
    reviews,
  };
};

/**
 * Retrieves full product details by SEO slug with Cache-Aside pattern.
 *
 * @param {string} slug - Product SEO slug or identifier
 * @returns {Promise<object|null>} Complete product detail or null
 */
const getProductBySlug = async (slug) => {
  if (!slug) return null;
  const cacheKey = `cache:product:slug:${slug}`;
  return cacheService.getOrSet(cacheKey, 3600, () => fetchProductDetailFromDb(slug));
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
  section,
  brand,
  page = 1,
  limit = 12,
}) => {
  const andConditions = [{ isActive: true }]; // archived products are hidden from the shop

  // Home page sections chosen by staff (#173); 'sale' lists discounted products (Sprint 13)
  if (section === 'new_arrivals') andConditions.push({ isNewArrival: true });
  if (section === 'popular') andConditions.push({ isPopular: true });
  if (section === 'sale') andConditions.push({ discountPercentage: { [Op.gt]: 0 } });
  if (brand) andConditions.push({ brand });
  const variantWhere = {};

  if (categoryId && categoryId !== 'all' && categoryId !== 'null' && categoryId !== 'undefined') {
    const rawCat = String(categoryId).trim();
    const isNumeric = /^\d+$/.test(rawCat);
    let categoryIds = [];

    if (isNumeric) {
      const numericId = parseInt(rawCat, 10);
      categoryIds.push(numericId);
      try {
        if (Category) {
          const subCategories = await Category.findAll({
            where: { parentId: numericId, isActive: true },
            attributes: ['id'],
          });
          if (subCategories && subCategories.length > 0) {
            categoryIds = categoryIds.concat(subCategories.map((c) => c.id));
          }
        }
      } catch (e) {
        // Fall back to direct numericId
      }
      andConditions.push({ categoryId: { [Op.in]: categoryIds } });
    } else {
      const slug = rawCat.toLowerCase();
      // Look up category by slug or name in Category model first
      try {
        if (Category) {
          const matchedCategory = await Category.findOne({
            where: {
              [Op.or]: [{ slug }, { name: { [Op.iLike]: slug } }],
            },
            attributes: ['id'],
          });
          if (matchedCategory) {
            categoryIds.push(matchedCategory.id);
            const subs = await Category.findAll({
              where: { parentId: matchedCategory.id, isActive: true },
              attributes: ['id'],
            });
            if (subs && subs.length > 0) {
              categoryIds = categoryIds.concat(subs.map((c) => c.id));
            }
          }
        }
      } catch (e) {
        // Fall back to direct semantic string matching if Category lookup fails
      }

      // Build comprehensive semantic OR conditions for category/collection matching
      const catOrConditions = [];
      if (categoryIds.length > 0) {
        catOrConditions.push({ categoryId: { [Op.in]: categoryIds } });
      }

      // Semantic mappings for top category bar & mega-menu shortcuts:
      if (slug === 'men') {
        catOrConditions.push(
          { categoryId: 1 },
          { category: 'Men' },
          { category: { [Op.in]: ['Men', 'Shirts', 'Pants', 'T-Shirts', 'Jackets'] } }
        );
      } else if (slug === 'men-batik-shirts') {
        catOrConditions.push(
          { categoryId: 11 },
          {
            [Op.and]: [
              { name: { [Op.iLike]: '%batik%' } },
              { category: { [Op.notIn]: ['Women', 'Kids', 'Accessories'] } },
            ],
          }
        );
      } else if (slug === 'women') {
        catOrConditions.push(
          { category: 'Women' },
          { category: { [Op.in]: ['Women', 'Saree', 'Saris', 'Dress', 'Kurti', 'Kaftan'] } },
          { name: { [Op.iLike]: '%saree%' } },
          { name: { [Op.iLike]: '%sari%' } },
          { name: { [Op.iLike]: '%kurti%' } }
        );
      } else if (slug === 'women-silk-saris') {
        catOrConditions.push(
          { categoryId: 21 },
          { name: { [Op.iLike]: '%saree%' } },
          { name: { [Op.iLike]: '%sari%' } }
        );
      } else if (slug.includes('batik')) {
        catOrConditions.push(
          { name: { [Op.iLike]: '%batik%' } },
          { description: { [Op.iLike]: '%batik%' } },
          { material: { [Op.iLike]: '%batik%' } },
          { category: { [Op.iLike]: '%batik%' } }
        );
      } else if (slug.includes('handloom')) {
        catOrConditions.push(
          { name: { [Op.iLike]: '%handloom%' } },
          { description: { [Op.iLike]: '%handloom%' } },
          { material: { [Op.iLike]: '%handloom%' } }
        );
      } else if (slug.includes('linen')) {
        catOrConditions.push(
          { name: { [Op.iLike]: '%linen%' } },
          { description: { [Op.iLike]: '%linen%' } },
          { material: { [Op.iLike]: '%linen%' } }
        );
      } else if (slug.includes('saree') || slug.includes('sari')) {
        catOrConditions.push(
          { name: { [Op.iLike]: '%saree%' } },
          { name: { [Op.iLike]: '%sari%' } },
          { category: { [Op.iLike]: '%saree%' } }
        );
      } else if (slug === 'kids' || slug.startsWith('kids-')) {
        catOrConditions.push(
          { category: 'Kids' },
          { category: { [Op.iLike]: '%kid%' } },
          { name: { [Op.iLike]: '%kid%' } }
        );
      } else if (slug === 'accessories' || slug.startsWith('accessories-')) {
        catOrConditions.push(
          { category: 'Accessories' },
          { category: { [Op.iLike]: '%accessories%' } },
          { category: { [Op.iLike]: '%shawl%' } },
          { name: { [Op.iLike]: '%shawl%' } },
          { name: { [Op.iLike]: '%belt%' } },
          { name: { [Op.iLike]: '%bag%' } }
        );
      } else {
        catOrConditions.push({ category: { [Op.iLike]: `%${slug}%` } });
      }

      andConditions.push({ [Op.or]: catOrConditions });
    }
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceWhere = {};
    if (minPrice !== undefined) priceWhere[Op.gte] = Number(minPrice);
    if (maxPrice !== undefined) priceWhere[Op.lte] = Number(maxPrice);
    andConditions.push({ price: priceWhere });
  }

  if (search) {
    // FR-001: name, description, brand and category; wildcards in the text are literal (#188)
    const term = `%${String(search)
      .trim()
      .replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    andConditions.push({
      [Op.or]: [
        { name: { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
        { brand: { [Op.iLike]: term } },
        { category: { [Op.iLike]: term } },
      ],
    });
  }

  const productWhere = andConditions.length > 0 ? { [Op.and]: andConditions } : {};

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
    const sale = applySale(plain.price, plain.discountPercentage);
    return {
      id: plain.id,
      name: plain.name,
      slug: plain.slug || slugify(plain.name),
      price: plain.price,
      base_price: plain.price,
      category: plain.categoryDetails?.name || plain.category,
      primary_image: plain.primaryImage ?? plain.primary_image,
      gallery_images: plain.galleryImages || [],
      brand: plain.brand || null,
      is_new_arrival: Boolean(plain.isNewArrival),
      is_popular: Boolean(plain.isPopular),
      is_on_sale: sale.isOnSale,
      discount_percentage: sale.isOnSale ? Number(plain.discountPercentage) : null,
      sale_price: sale.salePrice,
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
  applySale,
  fetchProductDetailFromDb,
  getProductBySlug,
  invalidateProductCache: cacheService.invalidateProductCache,
  listProducts,
};
