module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_variants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      sku: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      size: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      stock_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      reserved_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      additional_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
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

    await queryInterface.addIndex('product_variants', ['sku']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_variants');
  },
};
