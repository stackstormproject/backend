const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Order extends Model {
    static associate(models) {
      Order.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
      Order.belongsTo(models.PromoCode, { foreignKey: 'promoCodeId', as: 'promoCode' });
      Order.hasMany(models.OrderItem, { foreignKey: 'orderId', as: 'items' });
      Order.hasMany(models.Return, { foreignKey: 'orderId', as: 'returns' });
    }
  }

  Order.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'customer_id',
      },
      guestEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'guest_email',
      },
      guestOrderToken: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        field: 'guest_order_token',
      },
      orderDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'order_date',
      },
      status: {
        type: DataTypes.ENUM(
          'payment_pending',
          'confirmed',
          'processing',
          'shipped',
          'delivered',
          'cancelled',
          'return_requested',
          'returned'
        ),
        allowNull: false,
        defaultValue: 'payment_pending',
      },
      deliveryDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'delivery_date',
      },
      shippingAddress: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'shipping_address',
      },
      billingAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'billing_address',
      },
      paymentIntentId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'payment_intent_id',
      },
      shippingOption: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'shipping_option',
      },
      shippingCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'shipping_cost',
      },
      taxAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'tax_amount',
      },
      discountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        field: 'discount_amount',
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'total_amount',
      },
      trackingNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'tracking_number',
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      promoCodeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'promo_code_id',
      },
      // Sprint 13: loyalty points this order granted (on payment) and spent as a discount.
      loyaltyPointsEarned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'loyalty_points_earned',
      },
      loyaltyPointsRedeemed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'loyalty_points_redeemed',
      },
    },
    {
      sequelize,
      modelName: 'Order',
      tableName: 'orders',
      underscored: true,
    }
  );

  return Order;
};
