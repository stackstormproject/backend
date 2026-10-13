module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      hashed_password: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      registration_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      preferred_size: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      preferred_categories: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      newsletter_subscription: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      loyalty_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      loyalty_tier: {
        type: Sequelize.ENUM('silver', 'gold', 'platinum'),
        allowNull: false,
        defaultValue: 'silver',
      },
      reset_token_hash: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      reset_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex('customers', ['email'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customers');
  },
};
