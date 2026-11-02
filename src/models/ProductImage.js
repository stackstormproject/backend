const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ProductImage extends Model {
    static associate(models) {
      ProductImage.belongsTo(models.ProductVariant, {
        foreignKey: 'productVariantId',
        as: 'variant',
      });
    }
  }

  ProductImage.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productVariantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'product_variant_id',
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'image_url',
      },
      isPrimary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_primary',
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'display_order',
      },
    },
    {
      sequelize,
      modelName: 'ProductImage',
      tableName: 'product_images',
      underscored: true,
    }
  );

  return ProductImage;
};
