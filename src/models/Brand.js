const { Model, DataTypes } = require('sequelize');

// Refs #173: a brand shown under "Our brands"; products refer to it by name (products.brand).
module.exports = (sequelize) => {
  class Brand extends Model {}

  Brand.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      tagline: { type: DataTypes.STRING(120), allowNull: true },
      logoUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'logo_url' },
      isFeatured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_featured',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { sequelize, modelName: 'Brand', tableName: 'brands', underscored: true }
  );

  return Brand;
};
