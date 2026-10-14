const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Customer extends Model {
    static associate(models) {
      Customer.hasMany(models.Order, { foreignKey: 'customerId', as: 'orders' });
      Customer.hasMany(models.Address, { foreignKey: 'customerId', as: 'addresses' });
      Customer.hasOne(models.Cart, { foreignKey: 'customerId', as: 'cart' });
      Customer.hasOne(models.Loyalty, { foreignKey: 'customerId', as: 'loyalty' });
      Customer.hasMany(models.Review, { foreignKey: 'customerId', as: 'reviews' });
      Customer.hasMany(models.Notification, { foreignKey: 'customerId', as: 'notifications' });
      Customer.hasMany(models.Wishlist, { foreignKey: 'customerId', as: 'wishlists' });
      Customer.hasMany(models.LoyaltyTransaction, {
        foreignKey: 'customerId',
        as: 'loyaltyTransactions',
      });
      Customer.hasMany(models.ChatSession, { foreignKey: 'customerId', as: 'chatSessions' });
    }
  }

  Customer.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: 'Must be a valid email address' } },
      },
      hashedPassword: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'hashed_password',
      },
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
      loyaltyTier: {
        type: DataTypes.ENUM('silver', 'gold', 'platinum'),
        defaultValue: 'silver',
        field: 'loyalty_tier',
      },
      loyaltyPoints: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'loyalty_points',
      },
      resetTokenHash: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'reset_token_hash',
      },
      resetTokenExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'reset_token_expires_at',
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deleted_at',
      },
    },
    {
      sequelize,
      modelName: 'Customer',
      tableName: 'customers',
      underscored: true,
      paranoid: true,
    }
  );

  return Customer;
};
