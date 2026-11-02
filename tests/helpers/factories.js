const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize, ProductVariant } = require('../../src/models');

const unique = () => crypto.randomUUID();

const columnCache = {};

/** Reads NOT NULL columns that have no default (those must be supplied on INSERT). */
const requiredColumns = async (table) => {
  if (!columnCache[table]) {
    columnCache[table] = await sequelize.query(
      `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
          AND is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO'`,
      { replacements: { table }, type: QueryTypes.SELECT }
    );
  }
  return columnCache[table];
};

const enumFirstLabel = async (udtName) => {
  const [row] = await sequelize.query(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = :udtName ORDER BY e.enumsortorder LIMIT 1`,
    { replacements: { udtName }, type: QueryTypes.SELECT }
  );
  return row.enumlabel;
};

const defaultValueFor = async ({ column_name: name, data_type: type, udt_name: udt }) => {
  if (name.includes('email')) return `t-${unique()}@test.lk`;
  switch (type) {
    case 'integer':
    case 'bigint':
    case 'smallint':
      return 1;
    case 'numeric':
    case 'double precision':
    case 'real':
      return 1000;
    case 'boolean':
      return false;
    case 'json':
    case 'jsonb':
      return '{}';
    case 'USER-DEFINED':
      return enumFirstLabel(udt);
    default:
      return /timestamp|date/.test(type) ? new Date() : `${name}-${unique()}`;
  }
};

/** Inserts one row, filling every required column the caller did not override. */
const insertRow = async (table, overrides = {}) => {
  const values = { ...overrides };
  const columns = await requiredColumns(table);
  // eslint-disable-next-line no-restricted-syntax
  for (const col of columns) {
    if (values[col.column_name] === undefined) {
      // eslint-disable-next-line no-await-in-loop
      values[col.column_name] = await defaultValueFor(col);
    }
  }
  const names = Object.keys(values);
  const [row] = await sequelize.query(
    `INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(', ')})
     VALUES (${names.map((n) => `:${n}`).join(', ')}) RETURNING id`,
    { replacements: values, type: QueryTypes.SELECT }
  );
  return row;
};

/** Creates a variant of a new product, or of `productId` (another size of it). */
const createTestVariant = async ({ stockQuantity = 10, reservedQuantity = 0, productId } = {}) => {
  const productIdToUse = productId || (await insertRow('products')).id;
  const variant = await insertRow('product_variants', {
    product_id: productIdToUse,
    sku: `SKU-${unique()}`,
    stock_quantity: stockQuantity,
    reserved_quantity: reservedQuantity,
  });
  return ProductVariant.findByPk(variant.id);
};

const createTestCustomer = async () => insertRow('customers');

module.exports = { createTestVariant, createTestCustomer, insertRow };
