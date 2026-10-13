const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Address extends Model {
    static associate(models) {
      Address.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
    }
  }

  Address.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'customer_id',
      },
      addressLine1: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'address_line1',
      },
      addressLine2: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'address_line2',
      },
      city: { type: DataTypes.STRING, allowNull: false },
      state: { type: DataTypes.STRING, allowNull: true },
      postalCode: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'postal_code',
      },
      country: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Sri Lanka',
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_default',
      },
    },
    {
      sequelize,
      modelName: 'Address',
      tableName: 'addresses',
      underscored: true,
    }
  );

  return Address;
};
