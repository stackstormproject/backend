const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ChatSession extends Model {
    static associate(models) {
      ChatSession.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' });
      ChatSession.belongsTo(models.Admin, { foreignKey: 'agentId', as: 'agent' });
      ChatSession.hasMany(models.ChatMessage, {
        foreignKey: 'chatSessionId',
        as: 'messages',
      });
    }
  }

  ChatSession.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'customer_id',
      },
      agentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'agent_id',
      },
      status: {
        type: DataTypes.ENUM('open', 'closed', 'waiting'),
        allowNull: false,
        defaultValue: 'open',
      },
    },
    {
      sequelize,
      modelName: 'ChatSession',
      tableName: 'chat_sessions',
      underscored: true,
    }
  );

  return ChatSession;
};
