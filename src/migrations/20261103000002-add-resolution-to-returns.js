// Refs #137: record who resolved a return, when, and the note shown to the customer.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('returns');
    if (!table.admin_note) {
      await queryInterface.addColumn('returns', 'admin_note', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.resolved_by) {
      await queryInterface.addColumn('returns', 'resolved_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'admins', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
    if (!table.resolved_at) {
      await queryInterface.addColumn('returns', 'resolved_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('returns');
    if (table.resolved_at) await queryInterface.removeColumn('returns', 'resolved_at');
    if (table.resolved_by) await queryInterface.removeColumn('returns', 'resolved_by');
    if (table.admin_note) await queryInterface.removeColumn('returns', 'admin_note');
  },
};
