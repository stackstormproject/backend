const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Loyalty extends Model {
    static associate(models) {
      Loyalty.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
    }
  }

  Loyalty.init(
    {
      customerId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        field: 'customer_id',
      },
      currentPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'current_points',
      },
      lifetimePoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'lifetime_points',
      },
      tier: {
        type: DataTypes.ENUM('silver', 'gold', 'platinum'),
        allowNull: false,
        defaultValue: 'silver',
      },
      tierStartDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'tier_start_date',
      },
    },
    {
      sequelize,
      modelName: 'Loyalty',
      tableName: 'loyalties',
      underscored: true,
    }
  );

  return Loyalty;
};
