// Refs #138: manual point corrections by staff are their own transaction type, with the admin.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_loyalty_transactions_transaction_type ADD VALUE IF NOT EXISTS 'adjusted'"
    );
    const table = await queryInterface.describeTable('loyalty_transactions');
    if (!table.admin_id) {
      await queryInterface.addColumn('loyalty_transactions', 'admin_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'admins', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    // PostgreSQL cannot drop an enum value; only the column is removed.
    const table = await queryInterface.describeTable('loyalty_transactions');
    if (table.admin_id) await queryInterface.removeColumn('loyalty_transactions', 'admin_id');
  },
};
