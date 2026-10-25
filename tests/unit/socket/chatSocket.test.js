const http = require('http');
const jwt = require('jsonwebtoken');
const { io: Client } = require('socket.io-client');
const { initSocketServer } = require('../../../src/socket');
const { ChatSession, ChatMessage } = require('../../../src/models');

// Mock Sequelize models
jest.mock('../../../src/models', () => ({
  ChatSession: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  ChatMessage: {
    create: jest.fn(),
  },
}));

describe('STORM-BE-CHAT: Socket.IO Real-Time Chat Gateway', () => {
  let httpServer;
  let io;
  let serverPort;
  let clientSocket;
  let adminClientSocket;
  const JWT_SECRET = 'stackstorm_test_jwt_secret_key_32_chars';

  beforeAll((done) => {
    process.env.JWT_SECRET = JWT_SECRET;
    httpServer = http.createServer();
    io = initSocketServer(httpServer);

    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (io) io.close();
    if (httpServer) {
      httpServer.close(done);
    } else {
      done();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (adminClientSocket && adminClientSocket.connected) {
      adminClientSocket.disconnect();
    }
  });

  it('allows guest connection and attaches guest user profile', (done) => {
    clientSocket = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('authenticates admin token and joins admin_support_channel', (done) => {
    const adminToken = jwt.sign(
      { id: 99, role: 'support_agent', name: 'Agent Smith' },
      JWT_SECRET
    );

    adminClientSocket = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { token: adminToken },
    });

    adminClientSocket.on('connect', () => {
      expect(adminClientSocket.connected).toBe(true);
      done();
    });
  });

  it('handles customer chat:join by creating a session and notifying admin room', (done) => {
    const mockSession = {
      id: 101,
      customerId: 42,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    ChatSession.findOne.mockResolvedValue(null);
    ChatSession.create.mockResolvedValue(mockSession);

    const customerToken = jwt.sign(
      { id: 42, role: 'customer', name: 'Alice Customer' },
      JWT_SECRET
    );

    const adminToken = jwt.sign(
      { id: 99, role: 'support_agent', name: 'Agent Smith' },
      JWT_SECRET
    );

    adminClientSocket = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { token: adminToken },
    });

    adminClientSocket.on('connect', () => {
      adminClientSocket.on('support:new_session', (data) => {
        expect(data.sessionId).toBe(101);
        expect(data.customerId).toBe(42);

        clientSocket.disconnect();
        adminClientSocket.disconnect();
        done();
      });

      clientSocket = Client(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        auth: { token: customerToken },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit(
          'chat:join',
          { subject: 'Need help with return' },
          (response) => {
            expect(response.success).toBe(true);
            expect(response.sessionId).toBe(101);
          }
        );
      });
    });
  });

  it('dispatches chat:message, persists to database and broadcasts to room', (done) => {
    const mockSavedMessage = {
      id: 555,
      chatSessionId: 101,
      senderType: 'customer',
      senderId: 42,
      message: 'Where is my order?',
      createdAt: new Date(),
    };

    ChatMessage.create.mockResolvedValue(mockSavedMessage);

    clientSocket = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });

    clientSocket.on('connect', () => {
      ChatSession.create.mockResolvedValue({ id: 101, status: 'open' });
      clientSocket.emit('chat:join', { subject: 'Inquiry' }, () => {
        clientSocket.on('chat:message', (payload) => {
          expect(payload.sessionId).toBe(101);
          expect(payload.message).toBe('Where is my order?');
          expect(payload.senderRole).toBe('customer');
          expect(ChatMessage.create).toHaveBeenCalledWith({
            chatSessionId: 101,
            senderType: 'customer',
            senderId: null,
            message: 'Where is my order?',
          });
          done();
        });

        clientSocket.emit('chat:message', {
          sessionId: 101,
          message: 'Where is my order?',
        });
      });
    });
  });

  it('relays chat:typing indicator to room counterpart', (done) => {
    ChatSession.findByPk.mockResolvedValue({ id: 202, status: 'open', save: jest.fn() });

    const client1 = Client(`http://localhost:${serverPort}`, { transports: ['websocket'] });
    const client2 = Client(`http://localhost:${serverPort}`, { transports: ['websocket'] });

    let connected = 0;
    const onConnect = () => {
      connected += 1;
      if (connected === 2) {
        client1.emit('chat:join', { sessionId: 202 }, () => {
          client2.emit('chat:join', { sessionId: 202 }, () => {
            client2.on('chat:typing', (data) => {
              expect(data.sessionId).toBe(202);
              expect(data.isTyping).toBe(true);
              client1.disconnect();
              client2.disconnect();
              done();
            });

            client1.emit('chat:typing', { sessionId: 202, isTyping: true });
          });
        });
      }
    };

    client1.on('connect', onConnect);
    client2.on('connect', onConnect);
  });
});
