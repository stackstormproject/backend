const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Cart extends Model {
    static associate(models) {
      Cart.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
      Cart.belongsTo(models.PromoCode, { foreignKey: 'promoCodeId', as: 'promoCode' });
      Cart.hasMany(models.CartItem, { foreignKey: 'cartId', as: 'items' });
    }
  }

  Cart.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'customer_id',
      },
      sessionToken: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'session_token',
      },
      promoCodeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'promo_code_id',
      },
    },
    {
      sequelize,
      modelName: 'Cart',
      tableName: 'carts',
      underscored: true,
    }
  );

  return Cart;
};
