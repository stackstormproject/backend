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
      isNewArrival: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_new_arrival',
      },
      isPopular: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_popular',
      },
      galleryImages: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: 'gallery_images',
      },
      // Sprint 13: a percentage off `price`, set from the product form (#194, FR sale).
      // Null or 0 means the product is not on sale.
      discountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'discount_percentage',
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
