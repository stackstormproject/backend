// ==============================================================================
// Brands for the shop's "Our brands" section (#173). Products name their brand in
// products.brand; renaming a brand renames it on its products in the same transaction.
// ==============================================================================

const { Op, QueryTypes, UniqueConstraintError } = require('sequelize');
const { Brand, Product, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { slugify } = require('./product.service');

const NAME_MIN = 2;
const NAME_MAX = 60;
const TAGLINE_MAX = 120;
const SORT_MAX = 999;
const IMAGE_PATTERN = /^(https?:\/\/\S+|\/api\/v1\/media\/[\w./-]+)$/i;

const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const toView = (brand, productCount = 0) => ({
  id: brand.id,
  name: brand.name,
  slug: brand.slug,
  tagline: brand.tagline,
  logo_url: brand.logoUrl,
  is_featured: brand.isFeatured,
  sort_order: brand.sortOrder,
  product_count: productCount,
});

/** Active products per brand name, e.g. { 'Dickwella Atelier': 8 }. */
const productCounts = async () => {
  const rows = await sequelize.query(
    `SELECT brand, COUNT(*)::int AS count FROM products
      WHERE is_active = true AND brand IS NOT NULL GROUP BY brand`,
    { type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [r.brand, r.count]));
};

const ORDER = [
  ['sortOrder', 'ASC'],
  ['name', 'ASC'],
];

/** Shop: featured brands that have at least one product on sale. */
const listPublicBrands = async () => {
  const [brands, counts] = await Promise.all([
    Brand.findAll({ where: { isFeatured: true }, order: ORDER }),
    productCounts(),
  ]);
  return brands.map((b) => toView(b, counts.get(b.name) || 0)).filter((b) => b.product_count > 0);
};

/** Admin: every brand with its product count. */
const listBrands = async () => {
  const [brands, counts] = await Promise.all([Brand.findAll({ order: ORDER }), productCounts()]);
  return brands.map((b) => toView(b, counts.get(b.name) || 0));
};

const brandFields = (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.name !== undefined) {
    const name = clean(body.name, NAME_MAX);
    if (!name || name.length < NAME_MIN) {
      throw ApiError.badRequest(`Brand name must be ${NAME_MIN}-${NAME_MAX} characters`);
    }
    fields.name = name;
    fields.slug = slugify(name) || `brand-${Date.now()}`;
  }
  if (body.tagline !== undefined) fields.tagline = clean(body.tagline, TAGLINE_MAX);
  if (body.logo_url !== undefined) {
    const url = clean(body.logo_url, 500);
    if (url && (!IMAGE_PATTERN.test(url) || url.includes('..'))) {
      throw ApiError.badRequest('Logo must be an http(s) link or an uploaded image');
    }
    fields.logoUrl = url;
  }
  if (body.is_featured !== undefined) fields.isFeatured = Boolean(body.is_featured);
  if (body.sort_order !== undefined) {
    const order = Number(body.sort_order);
    if (!Number.isInteger(order) || order < 0 || order > SORT_MAX) {
      throw ApiError.badRequest(`Order must be a whole number between 0 and ${SORT_MAX}`);
    }
    fields.sortOrder = order;
  }
  return fields;
};

const duplicate = (err) => {
  if (err instanceof UniqueConstraintError) {
    return ApiError.conflict('A brand with this name already exists');
  }
  return err;
};

const createBrand = async (body) => {
  try {
    const brand = await Brand.create(brandFields(body));
    return toView(brand);
  } catch (err) {
    throw duplicate(err);
  }
};

const updateBrand = async (id, body) => {
  const fields = brandFields(body, { partial: true });
  try {
    const brand = await sequelize.transaction(async (transaction) => {
      const row = await Brand.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw ApiError.notFound(`Brand ${id} not found`);
      const oldName = row.name;
      await row.update(fields, { transaction });
      if (fields.name && fields.name !== oldName) {
        await Product.update({ brand: fields.name }, { where: { brand: oldName }, transaction });
      }
      return row;
    });
    const counts = await productCounts();
    return toView(brand, counts.get(brand.name) || 0);
  } catch (err) {
    throw duplicate(err);
  }
};

/** Products keep their brand text; it simply stops appearing under "Our brands". */
const deleteBrand = async (id) => {
  const removed = await Brand.destroy({ where: { id } });
  if (!removed) throw ApiError.notFound(`Brand ${id} not found`);
};

/** Product filter value: a brand slug or name -> the brand name stored on products. */
const brandNameFor = async (value) => {
  const term = String(value || '').trim();
  if (!term) return null;
  const brand = await Brand.findOne({
    where: { [Op.or]: [{ slug: term.toLowerCase() }, { name: { [Op.iLike]: term } }] },
  });
  return brand ? brand.name : term;
};

module.exports = {
  listPublicBrands,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  brandNameFor,
};
