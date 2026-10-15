module.exports = {
  async up(queryInterface, Sequelize) {
    const lockout = {
      failed_login_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      locked_until: { type: Sequelize.DATE, allowNull: true },
    };

    await Promise.all(
      ['customers', 'admins'].flatMap((table) =>
        Object.entries(lockout).map(([name, spec]) =>
          queryInterface.addColumn(table, name, spec),
        ),
      ),
    );

    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      admin_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'admins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_one_owner CHECK (
        (customer_id IS NOT NULL AND admin_id IS NULL) OR
        (customer_id IS NULL AND admin_id IS NOT NULL)
      )`,
    );

    await queryInterface.addIndex('refresh_tokens', ['customer_id']);
    await queryInterface.addIndex('refresh_tokens', ['admin_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
    await Promise.all(
      ['customers', 'admins'].flatMap((table) => [
        queryInterface.removeColumn(table, 'failed_login_attempts'),
        queryInterface.removeColumn(table, 'locked_until'),
      ]),
    );
  },
};
