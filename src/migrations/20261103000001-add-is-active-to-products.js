// Refs #136: archived products disappear from the shop but keep their order history.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('products');
    if (!table.is_active) {
      await queryInterface.addColumn('products', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
      await queryInterface.addIndex('products', ['is_active']);
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('products');
    if (table.is_active) await queryInterface.removeColumn('products', 'is_active');
  },
};
