const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class PromoCode extends Model {
    static associate(models) {
      PromoCode.hasMany(models.Order, { foreignKey: 'promoCodeId', as: 'orders' });
      PromoCode.hasMany(models.Cart, { foreignKey: 'promoCodeId', as: 'carts' });
    }
  }

  PromoCode.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      discountType: {
        type: DataTypes.ENUM('percentage', 'fixed_amount'),
        allowNull: false,
        field: 'discount_type',
      },
      discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'discount_value',
      },
      minOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'min_order_amount',
      },
      maxDiscountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'max_discount_amount',
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_date',
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'end_date',
      },
      usageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'usage_limit',
      },
      timesUsed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'times_used',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      sequelize,
      modelName: 'PromoCode',
      tableName: 'promo_codes',
      underscored: true,
    }
  );

  return PromoCode;
};
