// Refs #189 (FR-010, profile picture): a customer's photo and shopping preferences.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('customers');
    if (!table.avatar_url) {
      await queryInterface.addColumn('customers', 'avatar_url', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }
    if (!table.preferences) {
      await queryInterface.addColumn('customers', 'preferences', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('customers');
    if (table.preferences) await queryInterface.removeColumn('customers', 'preferences');
    if (table.avatar_url) await queryInterface.removeColumn('customers', 'avatar_url');
  },
};
