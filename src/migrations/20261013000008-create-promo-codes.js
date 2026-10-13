module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promo_codes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      discount_type: {
        type: Sequelize.ENUM('percentage', 'fixed_amount'),
        allowNull: false,
      },
      discount_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      min_order_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      max_discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      usage_limit: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      times_used: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    await queryInterface.dropTable('promo_codes');
  },
};
