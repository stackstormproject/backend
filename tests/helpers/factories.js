const { sequelize, ProductVariant } = require('../../src/models');
const { QueryTypes } = require('sequelize');

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

/**
 * Inserts a product and a variant using raw SQL (column names from your migrations),
 * then returns the ProductVariant model instance.
 */
const createTestVariant = async ({ stockQuantity = 10, reservedQuantity = 0 } = {}) => {
  const [product] = await sequelize.query(
    `INSERT INTO products (name, base_price, created_at, updated_at)
     VALUES (:name, 1000, NOW(), NOW()) RETURNING id`,
    { replacements: { name: `Test Product ${unique()}` }, type: QueryTypes.SELECT }
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

module.exports = { createTestVariant };
