// Refs #172: a product has one main image (primary_image) and up to three more for the gallery.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('products');
    if (!table.gallery_images) {
      await queryInterface.addColumn('products', 'gallery_images', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('products');
    if (table.gallery_images) await queryInterface.removeColumn('products', 'gallery_images');
  },
};
