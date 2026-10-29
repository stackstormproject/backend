// Refs #190 (FR-010): cards a customer chose to save while paying. Only the card brand, last
// four digits and expiry are kept here; the card itself stays with Stripe.
module.exports = {
  async up(queryInterface, Sequelize) {
    const customers = await queryInterface.describeTable('customers');
    if (!customers.stripe_customer_id) {
      await queryInterface.addColumn('customers', 'stripe_customer_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    await queryInterface.createTable('payment_methods', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.STRING(16), allowNull: false },
      provider_ref: { type: Sequelize.STRING(64), allowNull: false },
      brand: { type: Sequelize.STRING(32), allowNull: false },
      last4: { type: Sequelize.STRING(4), allowNull: false },
      exp_month: { type: Sequelize.INTEGER, allowNull: false },
      exp_year: { type: Sequelize.INTEGER, allowNull: false },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('payment_methods', ['customer_id', 'provider_ref'], {
      unique: true,
      name: 'payment_methods_customer_ref_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_methods');
    const customers = await queryInterface.describeTable('customers');
    if (customers.stripe_customer_id) {
      await queryInterface.removeColumn('customers', 'stripe_customer_id');
    }
  },
};
