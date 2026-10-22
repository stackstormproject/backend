module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE carts ADD COLUMN session_token VARCHAR(64);

      -- Exactly one owner: a customer OR a guest session
      ALTER TABLE carts ADD CONSTRAINT chk_cart_single_owner
        CHECK ((customer_id IS NOT NULL) <> (session_token IS NOT NULL));

      -- One cart per customer, one cart per guest token
      CREATE UNIQUE INDEX uq_carts_customer ON carts (customer_id) WHERE customer_id IS NOT NULL;
      CREATE UNIQUE INDEX uq_carts_session  ON carts (session_token) WHERE session_token IS NOT NULL;

      -- One row per SKU per cart, and positive quantity
      CREATE UNIQUE INDEX uq_cart_items_cart_variant ON cart_items (cart_id, product_variant_id);
      ALTER TABLE cart_items ADD CONSTRAINT chk_cart_item_quantity_positive CHECK (quantity > 0);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS chk_cart_item_quantity_positive;
      DROP INDEX IF EXISTS uq_cart_items_cart_variant;
      DROP INDEX IF EXISTS uq_carts_session;
      DROP INDEX IF EXISTS uq_carts_customer;
      ALTER TABLE carts DROP CONSTRAINT IF EXISTS chk_cart_single_owner;
      ALTER TABLE carts DROP COLUMN IF EXISTS session_token;
    `);
  },
};
