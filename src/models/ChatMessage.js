const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ChatMessage extends Model {
    static associate(models) {
      ChatMessage.belongsTo(models.ChatSession, {
        foreignKey: 'chatSessionId',
        as: 'session',
      });
    }
  }

  ChatMessage.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      chatSessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'chat_session_id',
      },
      senderType: {
        type: DataTypes.ENUM('customer', 'agent', 'bot'),
        allowNull: false,
        field: 'sender_type',
      },
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'sender_id',
      },
      message: { type: DataTypes.TEXT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'ChatMessage',
      tableName: 'chat_messages',
      underscored: true,
    }
  );

  return ChatMessage;
};
