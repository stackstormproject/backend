module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('products');
    if (!tableInfo.slug) {
      await queryInterface.addColumn('products', 'slug', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      });
    }
    if (!tableInfo.category_id) {
      await queryInterface.addColumn('products', 'category_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('products');
    if (tableInfo.category_id) {
      await queryInterface.removeColumn('products', 'category_id');
    }
    if (tableInfo.slug) {
      await queryInterface.removeColumn('products', 'slug');
    }
  },
};
