const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class OrderItem extends Model {
    static associate(models) {
      OrderItem.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
      OrderItem.belongsTo(models.ProductVariant, {
        foreignKey: 'productVariantId',
        as: 'variant',
      });
      OrderItem.hasMany(models.Return, { foreignKey: 'orderItemId', as: 'returns' });
    }
  }

  OrderItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'order_id',
      },
      productVariantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'product_variant_id',
      },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'unit_price',
      },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    },
    {
      sequelize,
      modelName: 'OrderItem',
      tableName: 'order_items',
      underscored: true,
    }
  );

  return OrderItem;
};
