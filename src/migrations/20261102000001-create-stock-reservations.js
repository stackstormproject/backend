module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE stock_reservations (
        id          VARCHAR(80) PRIMARY KEY,
        customer_id INTEGER NULL REFERENCES customers(id) ON DELETE SET NULL,
        order_id    INTEGER NULL REFERENCES orders(id) ON DELETE SET NULL,
        status      VARCHAR(12) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','CONFIRMED','RELEASED','EXPIRED')),
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- The expiry sweeper (#48) only scans ACTIVE rows
      CREATE INDEX idx_stock_reservations_active_expiry
        ON stock_reservations (expires_at) WHERE status = 'ACTIVE';

      CREATE TABLE reservation_items (
        reservation_id VARCHAR(80) NOT NULL
                       REFERENCES stock_reservations(id) ON DELETE CASCADE,
        variant_id     INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        quantity       INTEGER NOT NULL CHECK (quantity > 0),
        PRIMARY KEY (reservation_id, variant_id)
      );

      -- Last line of defence: the database refuses negative or oversold reservations
      ALTER TABLE product_variants
        ADD CONSTRAINT chk_reserved_bounds
        CHECK (reserved_quantity >= 0 AND reserved_quantity <= stock_quantity);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS chk_reserved_bounds;
      DROP TABLE IF EXISTS reservation_items;
      DROP TABLE IF EXISTS stock_reservations;
    `);
  },
};
