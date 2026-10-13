const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class LoyaltyTransaction extends Model {
    static associate(models) {
      LoyaltyTransaction.belongsTo(models.Customer, {
        foreignKey: 'customerId',
        as: 'customer',
      });
    }
  }

  LoyaltyTransaction.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'customer_id',
      },
      points: { type: DataTypes.INTEGER, allowNull: false },
      transactionType: {
        type: DataTypes.ENUM('earned', 'redeemed', 'expired'),
        allowNull: false,
        field: 'transaction_type',
      },
      description: { type: DataTypes.STRING, allowNull: true },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
      isExpired: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_expired',
      },
    },
    {
      sequelize,
      modelName: 'LoyaltyTransaction',
      tableName: 'loyalty_transactions',
      underscored: true,
    }
  );

  return LoyaltyTransaction;
};
