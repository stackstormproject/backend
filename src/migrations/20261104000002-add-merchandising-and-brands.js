// Refs #173: staff choose which products appear in the shop's "New arrivals" and "Popular"
// sections, and manage the brands shown under "Our brands".
module.exports = {
  async up(queryInterface, Sequelize) {
    const products = await queryInterface.describeTable('products');
    if (!products.is_new_arrival) {
      await queryInterface.addColumn('products', 'is_new_arrival', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!products.is_popular) {
      await queryInterface.addColumn('products', 'is_popular', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    const tables = await queryInterface.showAllTables();
    if (!tables.includes('brands')) {
      await queryInterface.createTable('brands', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        tagline: { type: Sequelize.STRING(120), allowNull: true },
        logo_url: { type: Sequelize.STRING(500), allowNull: true },
        is_featured: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('brands');
    const products = await queryInterface.describeTable('products');
    if (products.is_popular) await queryInterface.removeColumn('products', 'is_popular');
    if (products.is_new_arrival) await queryInterface.removeColumn('products', 'is_new_arrival');
  },
};
