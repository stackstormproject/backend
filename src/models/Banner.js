const { Model, DataTypes } = require('sequelize');

// Sprint 13: the shop's three home page hero banners, set by staff in the admin console.
module.exports = (sequelize) => {
  class Banner extends Model {}

  Banner.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      slot: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      title: { type: DataTypes.STRING(120), allowNull: false },
      subtitle: { type: DataTypes.STRING(240), allowNull: true },
      imageUrl: { type: DataTypes.STRING(500), allowNull: false, field: 'image_url' },
      buttonText: { type: DataTypes.STRING(40), allowNull: true, field: 'button_text' },
      buttonLink: { type: DataTypes.STRING(300), allowNull: true, field: 'button_link' },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
    },
    { sequelize, modelName: 'Banner', tableName: 'banners', underscored: true }
  );

  return Banner;
};
