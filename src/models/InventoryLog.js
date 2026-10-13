const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class InventoryLog extends Model {
    static associate(models) {
      InventoryLog.belongsTo(models.ProductVariant, {
        foreignKey: 'productVariantId',
        as: 'variant',
      });
      InventoryLog.belongsTo(models.Admin, { foreignKey: 'adminId', as: 'admin' });
    }
  }

  InventoryLog.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productVariantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'product_variant_id',
      },
      adminId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'admin_id',
      },
      changeQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'change_quantity',
      },
      reason: { type: DataTypes.STRING, allowNull: false },
    },
    {
      sequelize,
      modelName: 'InventoryLog',
      tableName: 'inventory_logs',
      underscored: true,
    }
  );

  return InventoryLog;
};
