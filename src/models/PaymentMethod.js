const { Model, DataTypes } = require('sequelize');

/** A card a customer saved while paying (#190). Never holds the card number itself. */
module.exports = (sequelize) => {
  class PaymentMethod extends Model {
    static associate(models) {
      PaymentMethod.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
    }
  }

  PaymentMethod.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: { type: DataTypes.INTEGER, allowNull: false, field: 'customer_id' },
      provider: { type: DataTypes.STRING(16), allowNull: false },
      providerRef: { type: DataTypes.STRING(64), allowNull: false, field: 'provider_ref' },
      brand: { type: DataTypes.STRING(32), allowNull: false },
      last4: { type: DataTypes.STRING(4), allowNull: false },
      expMonth: { type: DataTypes.INTEGER, allowNull: false, field: 'exp_month' },
      expYear: { type: DataTypes.INTEGER, allowNull: false, field: 'exp_year' },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_default',
      },
    },
    { sequelize, modelName: 'PaymentMethod', tableName: 'payment_methods', underscored: true }
  );

  return PaymentMethod;
};
