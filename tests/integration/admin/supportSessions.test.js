const request = require('supertest');
const app = require('../../../src/app');
const { ChatSession, ChatMessage, sequelize } = require('../../../src/models');
const { createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #156: the support console must tell agents, the virtual assistant and customers apart.
describe('GET /api/v1/admin/support/sessions', () => {
  let agent;
  let session;

  beforeAll(async () => {
    const customer = await createTestCustomer();
    agent = await createAdmin({
      email: `nimali.${Date.now()}@example.com`,
      role: 'support_agent',
    });
    await agent.update({ name: 'Nimali Perera' });
    session = await ChatSession.create({
      customerId: customer.id,
      agentId: agent.id,
      status: 'open',
    });
    const at = (seconds) => new Date(Date.UTC(2026, 9, 27, 10, 0, seconds));
    await ChatMessage.bulkCreate([
      {
        chatSessionId: session.id,
        senderType: 'customer',
        senderId: customer.id,
        message: 'Hi',
        createdAt: at(1),
      },
      {
        chatSessionId: session.id,
        senderType: 'bot',
        senderId: null,
        message: 'Connecting you',
        createdAt: at(2),
      },
      {
        chatSessionId: session.id,
        senderType: 'agent',
        senderId: agent.id,
        message: 'Hello',
        createdAt: at(3),
      },
      {
        chatSessionId: session.id,
        senderType: 'agent',
        senderId: null,
        message: 'Resolved',
        createdAt: at(4),
      },
    ]);
  });

  afterAll(async () => {
    await ChatMessage.destroy({ where: { chatSessionId: session.id } });
    await session.destroy();
    await sequelize.close();
  });

  it('should name agent messages after the agent and mark assistant messages as bot', async () => {
    const res = await request(app)
      .get('/api/v1/admin/support/sessions')
      .set('Authorization', `Bearer ${generateAccessToken(agent.id, 'support_agent')}`);

    expect(res.status).toBe(200);
    const found = res.body.data.sessions.find((s) => s.id === String(session.id));
    expect(found.status).toBe('agent_active');
    expect(found.messages.map((m) => [m.sender, m.sender_name])).toEqual([
      ['customer', expect.any(String)],
      ['bot', 'Virtual assistant'],
      ['agent', 'Nimali Perera'],
      ['agent', 'Support desk'],
    ]);
  });
});
