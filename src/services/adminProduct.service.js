// ==============================================================================
// Catalogue management for shop managers (UC-006, FR004, FR017).
// Only whitelisted fields are written (no mass assignment). Stock changes after creation go
// through adminInventory.service so every change is logged. Products with order history are
// archived, never deleted, so past orders keep their lines.
// ==============================================================================

const { Op, QueryTypes, UniqueConstraintError } = require('sequelize');
const { Product, ProductVariant, Category, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const cacheService = require('./cache.service');
const { slugify, formatVariant } = require('./product.service');

const NAME_MAX = 120;
const TEXT_MAX = 2000;
const PRICE_MAX = 1000000;
const STOCK_MAX = 10000;
const SIZE_MAX = 20;
const COLOR_MAX = 30;
const MAX_VARIANTS = 30;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_GALLERY_IMAGES = 3;
// An image is an http(s) link or a file uploaded to this backend's disk (/api/v1/media/...).
const URL_PATTERN = /^(https?:\/\/\S+|\/api\/v1\/media\/[\w./-]+)$/i;

const text = (value, max) => {
  const clean = String(value ?? '').trim();
  return clean ? clean.slice(0, max) : null;
};

const imageRef = (value, field) => {
  const url = text(value, 500);
  if (url && (!URL_PATTERN.test(url) || url.includes('..'))) {
    throw ApiError.badRequest(`${field} must be an http(s) link or an uploaded image`);
  }
  return url;
};

const galleryImages = (value) => {
  if (!Array.isArray(value)) throw ApiError.badRequest('Extra images must be a list');
  if (value.length > MAX_GALLERY_IMAGES) {
    throw ApiError.badRequest(`Add at most ${MAX_GALLERY_IMAGES} extra images`);
  }
  return value.map((url) => imageRef(url, 'Each extra image')).filter(Boolean);
};

const money = (value, field, { allowZero = false } = {}) => {
  const amount = Number(value);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    (!allowZero && amount === 0) ||
    amount > PRICE_MAX
  ) {
    throw ApiError.badRequest(
      `${field} must be a number between ${allowZero ? 0 : 1} and ${PRICE_MAX}`
    );
  }
  return Number(amount.toFixed(2));
};

/** Validates product fields. `partial` allows omitting fields on update. */
const productFields = async (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.name !== undefined) {
    const name = text(body.name, NAME_MAX);
    if (!name || name.length < 2) throw ApiError.badRequest('Name must be 2-120 characters');
    fields.name = name;
  }
  if (!partial || body.price !== undefined) fields.price = money(body.price, 'Price');
  ['description', 'material', 'brand'].forEach((key) => {
    if (body[key] !== undefined)
      fields[key] = text(body[key], key === 'description' ? TEXT_MAX : NAME_MAX);
  });
  if (body.care_instructions !== undefined) {
    fields.careInstructions = text(body.care_instructions, TEXT_MAX);
  }
  if (body.is_final_sale !== undefined) fields.isFinalSale = Boolean(body.is_final_sale);
  if (body.is_active !== undefined) fields.isActive = Boolean(body.is_active);
  if (body.is_new_arrival !== undefined) fields.isNewArrival = Boolean(body.is_new_arrival);
  if (body.is_popular !== undefined) fields.isPopular = Boolean(body.is_popular);
  if (body.primary_image !== undefined) fields.primaryImage = imageRef(body.primary_image, 'Image');
  if (body.gallery_images !== undefined) fields.galleryImages = galleryImages(body.gallery_images);
  if (body.category_id !== undefined) {
    if (body.category_id === null || body.category_id === '') {
      fields.categoryId = null;
      fields.category = null;
    } else {
      const category = await Category.findByPk(Number(body.category_id));
      if (!category) throw ApiError.badRequest(`Category ${body.category_id} does not exist`);
      fields.categoryId = category.id;
      fields.category = category.name; // legacy text column still used by catalogue search
    }
  }
  return fields;
};

const variantFields = (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.size !== undefined) {
    const size = text(body.size, SIZE_MAX);
    if (!size) throw ApiError.badRequest('Each variant needs a size');
    fields.size = size;
  }
  if (body.color !== undefined || !partial) fields.color = text(body.color, COLOR_MAX);
  if (body.additional_price !== undefined || !partial) {
    fields.additionalPrice = money(body.additional_price ?? 0, 'Extra price', { allowZero: true });
  }
  return fields;
};

const initialStock = (value) => {
  const stock = Number(value ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAX) {
    throw ApiError.badRequest(`Opening stock must be a whole number between 0 and ${STOCK_MAX}`);
  }
  return stock;
};

const skuFor = (productId, { size, color }) =>
  [`DFC-${productId}`, size, color]
    .filter(Boolean)
    .join('-')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '');

/** Slug from the name; adds -2, -3... when taken. */
const uniqueSlug = async (name, transaction, excludeId = null) => {
  const base = slugify(name) || 'product';
  const taken = await Product.findAll({
    where: {
      slug: { [Op.like]: `${base}%` },
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
    attributes: ['slug'],
    transaction,
  });
  const slugs = new Set(taken.map((p) => p.slug));
  if (!slugs.has(base)) return base;
  let n = 2;
  while (slugs.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/** Units sold or currently held, per variant: such variants cannot be deleted. */
const usageByVariant = async (variantIds, transaction) => {
  if (!variantIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT v.id,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.product_variant_id = v.id)::int AS orders,
            (SELECT COUNT(*) FROM reservation_items ri WHERE ri.variant_id = v.id)::int AS holds
       FROM product_variants v WHERE v.id IN (:ids)`,
    { replacements: { ids: variantIds }, type: QueryTypes.SELECT, transaction }
  );
  return new Map(rows.map((r) => [r.id, r.orders + r.holds]));
};

const toAdminProduct = (product, usage = new Map()) => {
  const plain = product.get ? product.get({ plain: true }) : product;
  const variants = (plain.variants || [])
    .map(formatVariant)
    .sort((a, b) => a.id - b.id)
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      additional_price: Number(v.additionalPrice || 0),
      stock_quantity: v.stock_quantity,
      reserved_quantity: v.reserved_quantity,
      available: v.available_stock,
      in_use: (usage.get(v.id) || 0) > 0,
    }));
  return {
    id: plain.id,
    name: plain.name,
    slug: plain.slug,
    price: Number(plain.price),
    description: plain.description,
    material: plain.material,
    care_instructions: plain.careInstructions,
    brand: plain.brand,
    category_id: plain.categoryId,
    category_name: plain.categoryDetails?.name || plain.category || null,
    is_final_sale: plain.isFinalSale,
    is_active: plain.isActive,
    is_new_arrival: Boolean(plain.isNewArrival),
    is_popular: Boolean(plain.isPopular),
    primary_image: plain.primaryImage,
    gallery_images: plain.galleryImages || [],
    variants,
    total_available: variants.reduce((sum, v) => sum + v.available, 0),
    created_at: plain.createdAt,
    updated_at: plain.updatedAt,
  };
};

const INCLUDE = [
  { model: ProductVariant, as: 'variants' },
  { model: Category, as: 'categoryDetails', required: false },
];

const getProduct = async (id, transaction) => {
  const product = await Product.findByPk(id, { include: INCLUDE, transaction });
  if (!product) throw ApiError.notFound(`Product ${id} not found`);
  const usage = await usageByVariant(
    product.variants.map((v) => v.id),
    transaction
  );
  return toAdminProduct(product, usage);
};

/** All products, active and archived, newest first. */
const listProducts = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const where = {};
  const search = String(query.search || '').trim();
  if (search) where.name = { [Op.iLike]: `%${search}%` };
  if (query.status === 'active') where.isActive = true;
  if (query.status === 'archived') where.isActive = false;
  if (query.category_id) where.categoryId = Number(query.category_id);
  if (query.section === 'new_arrivals') where.isNewArrival = true;
  if (query.section === 'popular') where.isPopular = true;

  const { count, rows } = await Product.findAndCountAll({
    where,
    include: INCLUDE,
    order: [
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return {
    products: rows.map((p) => toAdminProduct(p)),
    pagination: { total: count, page, limit, total_pages: Math.ceil(count / limit) || 1 },
  };
};

const logStock = (variantId, adminId, change, transaction) =>
  sequelize.query(
    `INSERT INTO inventory_logs (product_variant_id, admin_id, change_quantity, reason, created_at, updated_at)
     VALUES (:variantId, :adminId, :change, 'opening stock', NOW(), NOW())`,
    { replacements: { variantId, adminId, change }, transaction }
  );

const createVariantRow = async (productId, body, adminId, transaction) => {
  const fields = variantFields(body);
  const stock = initialStock(body.stock_quantity);
  try {
    const variant = await ProductVariant.create(
      {
        ...fields,
        productId,
        sku: skuFor(productId, fields),
        stockQuantity: stock,
        reservedQuantity: 0,
      },
      { transaction }
    );
    if (stock > 0) await logStock(variant.id, adminId, stock, transaction);
    return variant;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict(
        `This product already has a ${[fields.size, fields.color].filter(Boolean).join(' / ')} variant`
      );
    }
    throw err;
  }
};

/** Creates a product with at least one variant (a product without one cannot be bought). */
const createProduct = async (body, adminId) => {
  const variants = Array.isArray(body.variants) ? body.variants : [];
  if (!variants.length) throw ApiError.badRequest('Add at least one size');
  if (variants.length > MAX_VARIANTS) throw ApiError.badRequest(`At most ${MAX_VARIANTS} variants`);
  const fields = await productFields(body);

  const id = await sequelize.transaction(async (transaction) => {
    const slug = await uniqueSlug(fields.name, transaction);
    const product = await Product.create({ ...fields, slug }, { transaction });
    // Sequential inside one transaction (a transaction cannot run queries in parallel).
    await variants.reduce(
      (previous, variant) =>
        previous.then(() => createVariantRow(product.id, variant, adminId, transaction)),
      Promise.resolve()
    );
    return product.id;
  });
  await cacheService.invalidateProductCache(id).catch(() => {});
  return getProduct(id);
};

/** Updates product fields. Changing the name keeps the slug so shared links keep working. */
const updateProduct = async (id, body) => {
  const product = await Product.findByPk(id);
  if (!product) throw ApiError.notFound(`Product ${id} not found`);
  const fields = await productFields(body, { partial: true });
  const oldSlug = product.slug;
  await product.update(fields);
  await cacheService.invalidateProductCache(id, oldSlug).catch(() => {});
  return getProduct(id);
};

const addVariant = async (productId, body, adminId) => {
  const product = await Product.findByPk(productId);
  if (!product) throw ApiError.notFound(`Product ${productId} not found`);
  await sequelize.transaction((transaction) =>
    createVariantRow(product.id, body, adminId, transaction)
  );
  await cacheService.invalidateProductCache(product.id, product.slug).catch(() => {});
  return getProduct(product.id);
};

const findVariant = async (productId, variantId, transaction) => {
  const variant = await ProductVariant.findOne({
    where: { id: variantId, productId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!variant) throw ApiError.notFound(`Variant ${variantId} not found on product ${productId}`);
  return variant;
};

/** Size, colour and extra price only; stock changes go through inventory adjustments. */
const updateVariant = async (productId, variantId, body) => {
  const variant = await findVariant(productId, variantId);
  const fields = variantFields(body, { partial: true });
  const renaming =
    (fields.size !== undefined && fields.size !== variant.size) ||
    (fields.color !== undefined && fields.color !== variant.color);
  if (renaming) {
    // Past order lines point at this variant; renaming it would rewrite what they show.
    const usage = await usageByVariant([variant.id]);
    if (usage.get(variant.id) > 0) {
      throw ApiError.conflict(
        'This size has been ordered, so its size and colour cannot change. Add a new size instead.'
      );
    }
    fields.sku = skuFor(productId, {
      size: fields.size ?? variant.size,
      color: fields.color !== undefined ? fields.color : variant.color,
    });
  }
  try {
    await variant.update(fields);
  } catch (err) {
    if (err instanceof UniqueConstraintError)
      throw ApiError.conflict('That size and colour already exist');
    throw err;
  }
  const product = await Product.findByPk(productId);
  await cacheService.invalidateProductCache(productId, product?.slug).catch(() => {});
  return getProduct(productId);
};

/** Setup-only stock logs of never-sold variants go with them (they describe no sale). */
const deleteSetupLogs = (variantIds, transaction) =>
  variantIds.length
    ? sequelize.query('DELETE FROM inventory_logs WHERE product_variant_id IN (:ids)', {
        replacements: { ids: variantIds },
        transaction,
      })
    : Promise.resolve();

const removeVariant = async (productId, variantId) => {
  await sequelize.transaction(async (transaction) => {
    const variant = await findVariant(productId, variantId, transaction);
    const usage = await usageByVariant([variant.id], transaction);
    if (usage.get(variant.id) > 0) {
      throw ApiError.conflict(
        'This size has been ordered or is in a checkout, so it cannot be deleted. Set its stock to 0 instead.'
      );
    }
    const remaining = await ProductVariant.count({ where: { productId }, transaction });
    if (remaining <= 1) throw ApiError.conflict('A product needs at least one size');
    await deleteSetupLogs([variant.id], transaction);
    await variant.destroy({ transaction });
  });
  const product = await Product.findByPk(productId);
  await cacheService.invalidateProductCache(productId, product?.slug).catch(() => {});
  return getProduct(productId);
};

/** Deletes a product that was never ordered; anything with history must be archived. */
const deleteProduct = async (id) => {
  const slug = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(id, { include: INCLUDE, transaction });
    if (!product) throw ApiError.notFound(`Product ${id} not found`);
    const usage = await usageByVariant(
      product.variants.map((v) => v.id),
      transaction
    );
    if ([...usage.values()].some((n) => n > 0)) {
      throw ApiError.conflict(
        'This product has orders, so it cannot be deleted. Archive it to hide it from the shop.'
      );
    }
    await deleteSetupLogs(
      product.variants.map((v) => v.id),
      transaction
    );
    await product.destroy({ transaction });
    return product.slug;
  });
  await cacheService.invalidateProductCache(id, slug).catch(() => {});
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  addVariant,
  updateVariant,
  removeVariant,
  deleteProduct,
  skuFor,
};
