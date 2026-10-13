module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      guest_email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      guest_order_token: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      order_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      status: {
        type: Sequelize.ENUM(
          'payment_pending',
          'confirmed',
          'processing',
          'shipped',
          'delivered',
          'cancelled',
          'return_requested',
          'returned'
        ),
        allowNull: false,
        defaultValue: 'payment_pending',
      },
      delivery_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      shipping_address: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      billing_address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      payment_intent_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      shipping_option: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      shipping_cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      tax_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      total_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      tracking_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      promo_code_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'promo_codes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('orders', ['customer_id']);
    await queryInterface.addIndex('orders', ['status']);
    await queryInterface.addIndex('orders', ['order_date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
  },
};
