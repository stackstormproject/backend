const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Return extends Model {
    static associate(models) {
      Return.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
      Return.belongsTo(models.OrderItem, { foreignKey: 'orderItemId', as: 'orderItem' });
      Return.belongsTo(models.ProductVariant, {
        foreignKey: 'exchangeVariantId',
        as: 'exchangeVariant',
      });
    }
  }

  Return.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'order_id',
      },
      orderItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'order_item_id',
      },
      type: {
        type: DataTypes.ENUM('return', 'exchange'),
        allowNull: false,
        defaultValue: 'return',
      },
      exchangeVariantId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'exchange_variant_id',
      },
      reason: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM('requested', 'approved', 'rejected', 'completed'),
        allowNull: false,
        defaultValue: 'requested',
      },
      adminNote: { type: DataTypes.TEXT, allowNull: true, field: 'admin_note' },
      resolvedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'resolved_by' },
      resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'refund_amount',
      },
    },
    {
      sequelize,
      modelName: 'Return',
      tableName: 'returns',
      underscored: true,
    }
  );

  return Return;
};
