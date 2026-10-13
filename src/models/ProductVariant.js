const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ProductVariant extends Model {
    static associate(models) {
      ProductVariant.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
      ProductVariant.hasMany(models.ProductImage, {
        foreignKey: 'productVariantId',
        as: 'images',
      });
      ProductVariant.hasMany(models.OrderItem, {
        foreignKey: 'productVariantId',
        as: 'orderItems',
      });
      ProductVariant.hasMany(models.CartItem, {
        foreignKey: 'productVariantId',
        as: 'cartItems',
      });
      ProductVariant.hasMany(models.InventoryLog, {
        foreignKey: 'productVariantId',
        as: 'inventoryLogs',
      });
    }
  }

  ProductVariant.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'product_id',
      },
      sku: { type: DataTypes.STRING, allowNull: false, unique: true },
      size: { type: DataTypes.STRING, allowNull: true },
      color: { type: DataTypes.STRING, allowNull: true },
      stockQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'stock_quantity',
      },
      reservedQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'reserved_quantity',
      },
      additionalPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'additional_price',
      },
    },
    {
      sequelize,
      modelName: 'ProductVariant',
      tableName: 'product_variants',
      underscored: true,
    }
  );

  return ProductVariant;
};
