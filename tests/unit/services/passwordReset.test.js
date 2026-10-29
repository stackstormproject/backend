jest.mock('../../../src/models', () => ({
  sequelize: { transaction: jest.fn((work) => work('trx')) },
  Customer: { findOne: jest.fn() },
  RefreshToken: { update: jest.fn() },
}));
jest.mock('../../../src/utils/passwordHash', () => ({
  hashPassword: jest.fn(async () => 'new-hash'),
}));
jest.mock('../../../src/services/mail.service', () => ({
  sendMail: jest.fn(),
  isMailConfigured: jest.fn(() => false),
}));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { Customer, RefreshToken } = require('../../../src/models');
const { sendMail, isMailConfigured } = require('../../../src/services/mail.service');
const logger = require('../../../src/config/logger');
const { hashToken } = require('../../../src/utils/tokenGenerator');
const { requestReset, resetPassword } = require('../../../src/services/passwordReset.service');

// Refs #185
const customer = (overrides = {}) => ({
  id: 7,
  name: 'Nimali <Perera>',
  email: 'nimali@example.lk',
  resetTokenExpiresAt: new Date(Date.now() + 60000),
  update: jest.fn(),
  ...overrides,
});

describe('requestReset', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'http://shop.test/';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('should do nothing and reveal nothing for an unknown email', async () => {
    Customer.findOne.mockResolvedValue(null);

    await expect(requestReset('nobody@example.lk')).resolves.toEqual({});
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('should store only a hash of a one-hour token and email the link', async () => {
    const record = customer();
    Customer.findOne.mockResolvedValue(record);

    const { devResetUrl } = await requestReset('nimali@example.lk');

    const token = devResetUrl.match(/token=([a-f0-9]{64})$/)[1];
    expect(devResetUrl).toBe(`http://shop.test/reset-password?token=${token}`);
    const saved = record.update.mock.calls[0][0];
    expect(saved.resetTokenHash).toBe(hashToken(token));
    expect(saved.resetTokenExpiresAt.getTime() - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('nimali@example.lk');
    expect(mail.text).toContain(devResetUrl);
    expect(mail.html).toContain('Hello Nimali Perera,');
  });

  it('should not return the link when mail is set up or in production', async () => {
    Customer.findOne.mockResolvedValue(customer());
    isMailConfigured.mockReturnValueOnce(true);
    await expect(requestReset('nimali@example.lk')).resolves.toEqual({});

    process.env.NODE_ENV = 'production';
    await expect(requestReset('nimali@example.lk')).resolves.toEqual({});
  });

  it('should answer the same when the email cannot be sent', async () => {
    Customer.findOne.mockResolvedValue(customer());
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(requestReset('nimali@example.lk')).resolves.toHaveProperty('devResetUrl');
    expect(logger.error).toHaveBeenCalledWith('Password reset email failed', expect.anything());
  });
});

describe('resetPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should set the new password, clear the token and end every session', async () => {
    const record = customer({ failedLoginAttempts: 3 });
    Customer.findOne.mockResolvedValue(record);

    await resetPassword('a'.repeat(64), 'NewPass123');

    expect(Customer.findOne).toHaveBeenCalledWith({
      where: { resetTokenHash: hashToken('a'.repeat(64)) },
    });
    expect(record.update).toHaveBeenCalledWith(
      {
        hashedPassword: 'new-hash',
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      { transaction: 'trx' }
    );
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { customerId: 7, revokedAt: null }, transaction: 'trx' }
    );
  });

  it.each([
    ['no token', '', null],
    ['an unknown token', 'b'.repeat(64), null],
    ['an expired token', 'c'.repeat(64), customer({ resetTokenExpiresAt: new Date(0) })],
    ['a token without expiry', 'd'.repeat(64), customer({ resetTokenExpiresAt: null })],
  ])('should refuse %s', async (_label, token, record) => {
    Customer.findOne.mockResolvedValue(record);

    await expect(resetPassword(token, 'NewPass123')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_RESET_TOKEN',
    });
  });
});
