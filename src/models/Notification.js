const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
    }
  }

  Notification.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'customer_id',
      },
      recipientEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'recipient_email',
      },
      title: { type: DataTypes.STRING, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: true },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_read',
      },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      underscored: true,
    }
  );

  return Notification;
};
