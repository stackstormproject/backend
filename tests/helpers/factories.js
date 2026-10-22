const { sequelize, ProductVariant } = require('../../src/models');
const { QueryTypes } = require('sequelize');

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

/**
 * Inserts a product and a variant using raw SQL (column names from the current schema),
 * then returns the ProductVariant model instance.
 */
const createTestVariant = async ({ stockQuantity = 10, reservedQuantity = 0 } = {}) => {
  const [product] = await sequelize.query(
    `INSERT INTO products (name, price, created_at, updated_at)
     VALUES (:name, :price, NOW(), NOW()) RETURNING id`,
    { replacements: { name: `Test Product ${unique()}`, price: 1000 }, type: QueryTypes.SELECT }
  );

  const [variant] = await sequelize.query(
    `INSERT INTO product_variants
       (product_id, sku, stock_quantity, reserved_quantity, created_at, updated_at)
     VALUES (:productId, :sku, :stock, :reserved, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        productId: product.id,
        sku: `SKU-${unique()}`,
        stock: stockQuantity,
        reserved: reservedQuantity,
      },
      type: QueryTypes.SELECT,
    }
  );

  return ProductVariant.findByPk(variant.id);
};

const createTestCustomer = async () => {
  const [c] = await sequelize.query(
    `INSERT INTO customers (email, hashed_password, name)
     VALUES (:email, 'x', 'Test User') RETURNING id`,
    { replacements: { email: `t-${unique()}@test.lk` }, type: QueryTypes.SELECT }
  );
  return c;
};

module.exports = { createTestVariant, createTestCustomer };
