// Sprint 13 (#194): lets a product be put on sale with a discount percentage off its price.
module.exports = {
  async up(queryInterface, Sequelize) {
    const products = await queryInterface.describeTable('products');
    if (!products.discount_percentage) {
      await queryInterface.addColumn('products', 'discount_percentage', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const products = await queryInterface.describeTable('products');
    if (products.discount_percentage) {
      await queryInterface.removeColumn('products', 'discount_percentage');
    }
  },
};
