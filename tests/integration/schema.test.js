const { Sequelize } = require('sequelize');
const config = require('../../src/config/database');

const env = process.env.NODE_ENV || 'development';
const sequelize = new Sequelize(config[env].url, config[env]);

const EXPECTED_TABLES = [
  'addresses',
  'admins',
  'cart_items',
  'carts',
  'chat_messages',
  'chat_sessions',
  'customers',
  'inventory_logs',
  'loyalties',
  'loyalty_transactions',
  'notifications',
  'order_items',
  'orders',
  'product_images',
  'product_variants',
  'products',
  'promo_codes',
  'returns',
  'review_images',
  'reviews',
  'saved_payments',
  'wishlists',
];

async function columnInfo(table, column) {
  const [rows] = await sequelize.query(
    `SELECT is_nullable FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`
  );
  return rows;
}

describe('database schema', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should contain all 22 tables given the migrations ran', async () => {
    const [rows] = await sequelize.query(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const names = rows.map((row) => (typeof row === 'string' ? row : row.table_name || row[0]));
    EXPECTED_TABLES.forEach((table) => expect(names).toContain(table));
  });

  it('should allow a null customer id on orders given guest checkout (Issues Report 1)', async () => {
    const rows = await columnInfo('orders', 'customer_id');
    expect(rows[0].is_nullable).toBe('YES');
  });

  it('should not have a currency column on customers given LKR only (Issues Report 20)', async () => {
    const rows = await columnInfo('customers', 'currency');
    expect(rows).toHaveLength(0);
  });

  it('should have a guest order token on orders (Issues Report 11)', async () => {
    const rows = await columnInfo('orders', 'guest_order_token');
    expect(rows).toHaveLength(1);
  });
});
