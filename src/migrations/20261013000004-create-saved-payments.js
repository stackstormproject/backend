module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_payments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      payment_method_token: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      card_last_four: {
        type: Sequelize.STRING(4),
        allowNull: false,
      },
      card_brand: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      expiry_month: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      expiry_year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_payments');
  },
};
