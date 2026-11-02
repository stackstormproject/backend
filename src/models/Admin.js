const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Admin extends Model {
    static associate(models) {
      Admin.hasMany(models.ChatSession, { foreignKey: 'agentId', as: 'chatSessions' });
      Admin.hasMany(models.InventoryLog, { foreignKey: 'adminId', as: 'inventoryLogs' });
      Admin.hasMany(models.RefreshToken, { foreignKey: 'adminId', as: 'refreshTokens' });
    }
  }

  Admin.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      failedLoginAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'failed_login_attempts',
      },
      lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'locked_until',
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: 'Must be a valid email address' } },
      },
      name: { type: DataTypes.STRING, allowNull: false },
      hashedPassword: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'hashed_password',
      },
      role: {
        type: DataTypes.ENUM('super_admin', 'admin', 'support_agent'),
        allowNull: false,
        defaultValue: 'admin',
      },
    },
    {
      sequelize,
      modelName: 'Admin',
      tableName: 'admins',
      underscored: true,
    }
  );

  return Admin;
};
