const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Wishlist extends Model {
    static associate(models) {
      Wishlist.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
      Wishlist.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
    }
  }

  Wishlist.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'customer_id',
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'product_id',
      },
    },
    {
      sequelize,
      modelName: 'Wishlist',
      tableName: 'wishlists',
      underscored: true,
    }
  );

  return Wishlist;
};
