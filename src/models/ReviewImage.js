const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ReviewImage extends Model {
    static associate(models) {
      ReviewImage.belongsTo(models.Review, { foreignKey: 'reviewId', as: 'review' });
    }
  }

  ReviewImage.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      reviewId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'review_id',
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'image_url',
      },
    },
    {
      sequelize,
      modelName: 'ReviewImage',
      tableName: 'review_images',
      underscored: true,
    }
  );

  return ReviewImage;
};
