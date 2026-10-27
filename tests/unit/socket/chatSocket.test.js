const http = require('http');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');
const { io: Client } = require('socket.io-client');
const { initSocketServer } = require('../../../src/socket');
const { ChatSession, ChatMessage, Admin } = require('../../../src/models');

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
  Admin: {
    findByPk: jest.fn(),
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
    const adminToken = generateAccessToken(99, 'support_agent');

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

    const customerToken = generateAccessToken(42, 'customer');

    const adminToken = generateAccessToken(99, 'support_agent');

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
        clientSocket.emit('chat:join', { subject: 'Need help with return' }, (response) => {
          expect(response.success).toBe(true);
          expect(response.sessionId).toBe(101);
        });
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

  it('treats the removed literal admin token as a guest', (done) => {
    const intruder = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { token: 'mock-admin-token' },
    });
    intruder.on('connect', () => {
      const sockets = [...io.of('/').sockets.values()];
      const server = sockets.find((sk) => sk.id === intruder.id);
      expect(server.user.role).toBe('guest');
      expect(server.rooms.has('admin_support_channel')).toBe(false);
      intruder.disconnect();
      done();
    });
  });

  // Refs #139: the payload can no longer promote a customer to agent or open someone else's chat.
  describe('agent identity and session ownership (#139)', () => {
    const connect = (token) =>
      new Promise((resolve) => {
        const socket = Client(`http://localhost:${serverPort}`, {
          transports: ['websocket'],
          ...(token ? { auth: { token } } : {}),
        });
        socket.on('connect', () => resolve(socket));
      });
    const emit = (socket, event, data) =>
      new Promise((resolve) => {
        socket.emit(event, data, resolve);
      });
    const serverSocketOf = (client) =>
      [...io.of('/').sockets.values()].find((sk) => sk.id === client.id);
    const savedMessage = (overrides) => ({
      id: 900,
      chatSessionId: 301,
      message: 'hi',
      createdAt: new Date(),
      ...overrides,
    });

    it('should keep a customer out of the agent channel given isAgent in the payload', async () => {
      const customer = await connect(generateAccessToken(42, 'customer'));
      ChatSession.findByPk.mockResolvedValue({ id: 301, customerId: 42, save: jest.fn() });
      ChatSession.findOne.mockResolvedValue(null);
      ChatMessage.create.mockResolvedValue(savedMessage({ senderType: 'customer' }));

      await emit(customer, 'chat:join', { sessionId: 301, isAgent: true, role: 'support_agent' });
      const sent = await emit(customer, 'chat:message', {
        sessionId: 301,
        message: 'hi',
        isAgent: true,
        senderRole: 'support_agent',
        senderName: 'Fake Agent',
      });

      expect(serverSocketOf(customer).rooms.has('admin_support_channel')).toBe(false);
      expect(sent.message.senderRole).toBe('customer');
      expect(sent.message.senderName).toBe('Customer');
      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ senderType: 'customer', senderId: 42 })
      );
      customer.disconnect();
    });

    it("should refuse to let a customer join another customer's session", async () => {
      const customer = await connect(generateAccessToken(42, 'customer'));
      ChatSession.findByPk.mockResolvedValue({ id: 302, customerId: 7, save: jest.fn() });

      const res = await emit(customer, 'chat:join', { sessionId: 302 });

      expect(res.success).toBe(false);
      expect(serverSocketOf(customer).rooms.has('chat_session_302')).toBe(false);
      customer.disconnect();
    });

    it('should refuse a message to a session the customer has not joined', async () => {
      const customer = await connect(generateAccessToken(42, 'customer'));

      const res = await emit(customer, 'chat:message', { sessionId: 303, message: 'hello' });

      expect(res.success).toBe(false);
      expect(ChatMessage.create).not.toHaveBeenCalled();
      customer.disconnect();
    });

    it("should sign agent messages with the agent's own name", async () => {
      Admin.findByPk.mockResolvedValue({ id: 99, name: 'Nimali Perera' });
      ChatMessage.create.mockResolvedValue(savedMessage({ senderType: 'agent' }));
      const agent = await connect(generateAccessToken(99, 'support_agent'));

      const sent = await emit(agent, 'chat:message', { sessionId: 301, message: 'hi' });

      expect(sent.message).toMatchObject({
        senderRole: 'support_agent',
        senderName: 'Nimali Perera',
      });
      expect(ChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ senderType: 'agent', senderId: 99 })
      );
      agent.disconnect();
    });

    it('should report a missing session to an agent instead of creating one', async () => {
      ChatSession.findByPk.mockResolvedValue(null);
      const agent = await connect(generateAccessToken(99, 'support_agent'));

      const res = await emit(agent, 'chat:join', { sessionId: 404 });

      expect(res.success).toBe(false);
      expect(ChatSession.create).not.toHaveBeenCalled();
      agent.disconnect();
    });
  });
});
