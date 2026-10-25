/* eslint-disable no-param-reassign */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { ChatSession, ChatMessage } = require('../models');

/**
 * Initializes the Socket.IO server and registers real-time event handlers.
 *
 * @param {import('http').Server} httpServer
 * @param {object} [options]
 * @returns {import('socket.io').Server}
 */
function initSocketServer(httpServer, options = {}) {
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, or same-origin server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev to avoid blocking
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    ...options,
  });

  // Authentication Middleware: Parse JWT if provided
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      if (token && process.env.JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = decoded;
        } catch {
          // Token invalid or expired: proceed as guest
          socket.user = { id: null, role: 'guest', name: 'Guest' };
        }
      } else {
        socket.user = { id: null, role: 'guest', name: 'Guest' };
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const isAgent =
      socket.user &&
      ['admin', 'super_admin', 'support_agent', 'inventory_staff'].includes(socket.user.role);

    logger.info('[SOCKET] Client connected', {
      socketId: socket.id,
      userId: socket.user?.id,
      role: socket.user?.role,
    });

    // Support staff join the global admin support channel for new session alerts
    if (isAgent) {
      socket.join('admin_support_channel');
      logger.info('[SOCKET] Agent joined admin support channel', {
        socketId: socket.id,
        agentId: socket.user?.id,
      });
    }

    /**
     * chat:join — Customer starts/resumes a chat, or Agent joins a customer session
     */
    socket.on('chat:join', async (data, callback) => {
      try {
        const payload = data || {};
        const { sessionId, subject } = payload;
        let session;

        if (sessionId) {
          session = await ChatSession.findByPk(sessionId);
          if (!session) {
            const error = { message: 'Chat session not found' };
            socket.emit('chat:error', error);
            if (typeof callback === 'function') callback({ success: false, error });
            return;
          }

          // If support agent is joining, claim the session
          if (isAgent && !session.agentId) {
            session.agentId = socket.user.id;
            session.status = 'open';
            await session.save();
          }
        } else {
          // Customer joining or resuming an open session
          if (socket.user?.id) {
            session = await ChatSession.findOne({
              where: { customerId: socket.user.id, status: 'open' },
            });
          }

          if (!session) {
            session = await ChatSession.create({
              customerId: socket.user?.id || null,
              status: 'open',
            });

            // Notify support staff in admin channel of new queue item
            io.to('admin_support_channel').emit('support:new_session', {
              sessionId: session.id,
              customerId: session.customerId,
              subject: subject || 'Customer Storefront Inquiry',
              createdAt: session.createdAt,
            });
          }
        }

        const roomName = `chat_session_${session.id}`;
        socket.join(roomName);

        const senderRole = isAgent ? 'support_agent' : 'customer';

        // Notify room that user joined
        socket.to(roomName).emit('chat:user_joined', {
          sessionId: session.id,
          userId: socket.user?.id || null,
          role: senderRole,
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            sessionId: session.id,
            status: session.status,
          });
        }
      } catch (err) {
        logger.error('[SOCKET] Error in chat:join handler', { error: err.message });
        socket.emit('chat:error', { message: 'Failed to join chat session' });
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message });
        }
      }
    });

    /**
     * chat:message — Transmit and persist real-time chat messages
     */
    socket.on('chat:message', async (data, callback) => {
      try {
        const payload = data || {};
        const { sessionId, message } = payload;
        if (!sessionId || !message || typeof message !== 'string' || !message.trim()) {
          const error = { message: 'Session ID and message text are required' };
          socket.emit('chat:error', error);
          if (typeof callback === 'function') callback({ success: false, error });
          return;
        }

        const senderRole = isAgent ? 'support_agent' : 'customer';

        // Persist message in PostgreSQL
        const chatMsg = await ChatMessage.create({
          chatSessionId: sessionId,
          senderType: isAgent ? 'agent' : 'customer',
          senderId: socket.user?.id || null,
          message: message.trim(),
        });

        const messagePayload = {
          id: `msg-${chatMsg.id}`,
          sessionId,
          senderRole,
          senderName: socket.user?.name || (isAgent ? 'Support Agent' : 'Customer'),
          message: chatMsg.message,
          createdAt: chatMsg.createdAt.toISOString(),
        };

        const roomName = `chat_session_${sessionId}`;
        // Broadcast to all sockets in the session room (customer + agent)
        io.to(roomName).emit('chat:message', messagePayload);

        if (typeof callback === 'function') {
          callback({ success: true, message: messagePayload });
        }
      } catch (err) {
        logger.error('[SOCKET] Error in chat:message handler', { error: err.message });
        socket.emit('chat:error', { message: 'Failed to dispatch chat message' });
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message });
        }
      }
    });

    /**
     * chat:typing — Broadcast typing indicator to session counterpart
     */
    socket.on('chat:typing', (data) => {
      const payload = data || {};
      const { sessionId, isTyping } = payload;
      if (!sessionId) return;

      const roomName = `chat_session_${sessionId}`;
      socket.to(roomName).emit('chat:typing', {
        sessionId,
        isTyping: !!isTyping,
        role: isAgent ? 'support_agent' : 'customer',
      });
    });

    /**
     * chat:leave — Leave chat session room
     */
    socket.on('chat:leave', (data, callback) => {
      const payload = data || {};
      const { sessionId } = payload;
      if (sessionId) {
        const roomName = `chat_session_${sessionId}`;
        socket.leave(roomName);
        socket.to(roomName).emit('chat:user_left', {
          sessionId,
          userId: socket.user?.id || null,
          role: isAgent ? 'support_agent' : 'customer',
        });
      }
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('[SOCKET] Client disconnected', {
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
}

module.exports = { initSocketServer };
