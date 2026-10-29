// Sprint 13 (#195): the three admin-managed hero banners on the home page.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('banners')) {
      await queryInterface.createTable('banners', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        slot: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        title: { type: Sequelize.STRING(120), allowNull: false },
        subtitle: { type: Sequelize.STRING(240), allowNull: true },
        image_url: { type: Sequelize.STRING(500), allowNull: false },
        button_text: { type: Sequelize.STRING(40), allowNull: true },
        button_link: { type: Sequelize.STRING(300), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('banners')) {
      await queryInterface.dropTable('banners');
    }
  },
};
