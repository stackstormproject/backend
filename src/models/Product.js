const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Product extends Model {
    static associate(models) {
      Product.hasMany(models.ProductVariant, { foreignKey: 'productId', as: 'variants' });
      Product.hasMany(models.Review, { foreignKey: 'productId', as: 'reviews' });
      Product.hasMany(models.Wishlist, { foreignKey: 'productId', as: 'wishlists' });
      if (models.Category) {
        Product.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'categoryDetails' });
      }
    }
  }

  Product.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      slug: { type: DataTypes.STRING, allowNull: true, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      material: { type: DataTypes.STRING, allowNull: true },
      careInstructions: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'care_instructions',
      },
      category: { type: DataTypes.STRING, allowNull: true },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'category_id',
      },
      brand: { type: DataTypes.STRING, allowNull: true },
      isFinalSale: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_final_sale',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      primaryImage: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'primary_image',
      },
      galleryImages: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: 'gallery_images',
      },
    },
    {
      sequelize,
      modelName: 'Product',
      tableName: 'products',
      underscored: true,
    }
  );

  return Product;
};
