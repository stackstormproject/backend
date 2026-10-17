jest.mock('../../../src/models', () => ({
  sequelize: { transaction: jest.fn() },
  Admin: { findByPk: jest.fn() },
  Customer: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
  Loyalty: { create: jest.fn() },
  RefreshToken: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
}));
jest.mock('../../../src/utils/passwordHash', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));
jest.mock('../../../src/utils/tokenGenerator', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  hashToken: jest.fn(),
  getRefreshTtlMs: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sequelize, Admin, Customer, Loyalty, RefreshToken } = require('../../../src/models');
const { hashPassword, comparePassword } = require('../../../src/utils/passwordHash');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTtlMs,
} = require('../../../src/utils/tokenGenerator');
const logger = require('../../../src/config/logger');
const AuthService = require('../../../src/services/AuthService');

const transaction = { id: 'transaction', LOCK: { UPDATE: 'UPDATE' } };
const customerRecord = (overrides = {}) => {
  const customer = {
    id: 23,
    name: 'Test Customer',
    email: 'customer@example.com',
    hashedPassword: 'bcrypt-hash',
    resetTokenHash: 'reset-hash',
    resetTokenExpiresAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    get: jest.fn(() => ({
      id: 23,
      name: 'Test Customer',
      email: 'customer@example.com',
      hashedPassword: 'bcrypt-hash',
      resetTokenHash: 'reset-hash',
      resetTokenExpiresAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    })),
    update: jest.fn(),
    ...overrides,
  };
  return customer;
};

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation((callback) => callback(transaction));
    hashPassword.mockResolvedValue('new-bcrypt-hash');
    comparePassword.mockResolvedValue(true);
    generateAccessToken.mockReturnValue('access-token');
    generateRefreshToken.mockReturnValue({
      rawToken: 'raw-refresh-token',
      tokenHash: 'hashed-refresh-token',
    });
    hashToken.mockReturnValue('hashed-raw-refresh-token');
    getRefreshTtlMs.mockReturnValue(7 * 24 * 60 * 60 * 1000);
  });

  it('registers a customer, loyalty account, and owned refresh token in one transaction', async () => {
    const customer = customerRecord();
    Customer.create.mockResolvedValue(customer);
    Loyalty.create.mockResolvedValue({});
    RefreshToken.create.mockResolvedValue({});

    const result = await AuthService.register({
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'Passw0rd',
      phone: '+94123456789',
    });

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Customer',
        email: 'customer@example.com',
        hashedPassword: 'new-bcrypt-hash',
      }),
      { transaction }
    );
    expect(Loyalty.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 23, currentPoints: 0, tier: 'silver' }),
      { transaction }
    );
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 23,
        adminId: null,
        tokenHash: 'hashed-refresh-token',
        expiresAt: expect.any(Date),
      }),
      { transaction }
    );
    expect(result).toEqual({
      customer: {
        id: 23,
        name: 'Test Customer',
        email: 'customer@example.com',
      },
      accessToken: 'access-token',
      refreshToken: 'raw-refresh-token',
    });
    expect(logger.info).toHaveBeenCalledWith('Customer registered', { customerId: 23 });
  });

  it('logs in a customer and creates a refresh session', async () => {
    const customer = customerRecord();
    Customer.findOne.mockResolvedValue(customer);

    const result = await AuthService.loginCustomer('customer@example.com', 'Passw0rd');

    expect(Customer.findOne).toHaveBeenCalledWith({
      where: { email: 'customer@example.com' },
    });
    expect(comparePassword).toHaveBeenCalledWith('Passw0rd', 'bcrypt-hash');
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 23, adminId: null }),
      { transaction: undefined }
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(result.customer).not.toHaveProperty('hashedPassword');
    expect(logger.info).toHaveBeenCalledWith('Customer logged in', { customerId: 23 });
  });

  it('compares unknown-account passwords against a cached dummy hash', async () => {
    Customer.findOne.mockResolvedValue(null);

    await expect(
      AuthService.authenticate(Customer, 'customer', 'missing@example.com', 'Passw0rd')
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    await expect(
      AuthService.authenticate(Customer, 'customer', 'missing@example.com', 'Passw0rd')
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    expect(hashPassword).toHaveBeenCalledTimes(1);
    expect(comparePassword).toHaveBeenCalledTimes(2);
  });

  it('increments failed login attempts below the lockout threshold', async () => {
    const customer = customerRecord({ failedLoginAttempts: 2 });
    Customer.findOne.mockResolvedValue(customer);
    comparePassword.mockResolvedValue(false);

    await expect(
      AuthService.authenticate(Customer, 'customer', customer.email, 'wrong')
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    expect(customer.update).toHaveBeenCalledWith({ failedLoginAttempts: 3 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('locks an account after the configured number of failed attempts', async () => {
    const customer = customerRecord({ failedLoginAttempts: 4 });
    Customer.findOne.mockResolvedValue(customer);
    comparePassword.mockResolvedValue(false);

    await expect(
      AuthService.authenticate(Customer, 'customer', customer.email, 'wrong')
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    expect(customer.update).toHaveBeenCalledWith({
      failedLoginAttempts: 0,
      lockedUntil: expect.any(Date),
    });
    expect(logger.warn).toHaveBeenCalledWith('Account locked after failed logins', {
      subjectType: 'customer',
      subjectId: 23,
    });
  });

  it('rejects an account whose lockout has not expired', async () => {
    const customer = customerRecord({ lockedUntil: new Date(Date.now() + 60_000) });
    Customer.findOne.mockResolvedValue(customer);

    await expect(
      AuthService.authenticate(Customer, 'customer', customer.email, 'Passw0rd')
    ).rejects.toMatchObject({ statusCode: 423, code: 'ACCOUNT_LOCKED' });

    expect(comparePassword).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('clears expired lockout state after a successful login', async () => {
    const customer = customerRecord({
      failedLoginAttempts: 2,
      lockedUntil: new Date(Date.now() - 60_000),
    });
    Customer.findOne.mockResolvedValue(customer);

    await AuthService.authenticate(Customer, 'customer', customer.email, 'Passw0rd');

    expect(customer.update).toHaveBeenCalledWith({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it('issues refresh credentials for administrator-owned sessions', async () => {
    const admin = { id: 42, role: 'admin' };

    await AuthService.issueSession(admin, 'admin');

    expect(generateAccessToken).toHaveBeenCalledWith(42, 'admin');
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: null,
        adminId: 42,
        tokenHash: 'hashed-refresh-token',
      }),
      { transaction: undefined }
    );
  });

  it('rejects refresh requests without a token', async () => {
    await expect(AuthService.refresh()).rejects.toMatchObject({
      statusCode: 401,
      code: 'NO_REFRESH_TOKEN',
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['revoked', { revokedAt: new Date() }],
  ])('rejects a %s refresh token', async (_description, stored) => {
    RefreshToken.findOne.mockResolvedValue(stored);

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(RefreshToken.findOne).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed-raw-refresh-token' },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  });

  it('rejects expired refresh tokens', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  });

  it('asks clients to retry when a refresh token was just used', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 409,
      code: 'REFRESH_IN_PROGRESS',
    });
    expect(RefreshToken.update).not.toHaveBeenCalled();
  });

  it('revokes all customer sessions when an old refresh token is reused', async () => {
    RefreshToken.findOne.mockResolvedValue({
      customerId: 23,
      adminId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(Date.now() - 60_000),
    });

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_TOKEN_REUSE',
    });
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { customerId: 23, revokedAt: null }, transaction }
    );
    expect(logger.warn).toHaveBeenCalledWith('Refresh token reuse detected, all sessions revoked', {
      customerId: 23,
    });
  });

  it('rejects a refresh token whose customer no longer exists', async () => {
    RefreshToken.findOne.mockResolvedValue({
      customerId: 23,
      adminId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    Customer.findByPk.mockResolvedValue(null);

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rotates customer refresh tokens', async () => {
    const customer = customerRecord();
    const stored = {
      customerId: customer.id,
      adminId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      update: jest.fn(),
    };
    RefreshToken.findOne.mockResolvedValue(stored);
    Customer.findByPk.mockResolvedValue(customer);
    RefreshToken.create.mockResolvedValue({});

    await expect(AuthService.refresh('raw-token')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'raw-refresh-token',
    });
    expect(stored.update).toHaveBeenCalledWith({ usedAt: expect.any(Date) }, { transaction });
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: customer.id, adminId: null }),
      { transaction }
    );
  });

  it('rejects a refresh token whose administrator no longer exists', async () => {
    RefreshToken.findOne.mockResolvedValue({
      customerId: null,
      adminId: 42,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    Admin.findByPk.mockResolvedValue(null);

    await expect(AuthService.refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rotates administrator refresh tokens', async () => {
    const admin = { id: 42, role: 'admin' };
    const stored = {
      customerId: null,
      adminId: admin.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      update: jest.fn(),
    };
    RefreshToken.findOne.mockResolvedValue(stored);
    Admin.findByPk.mockResolvedValue(admin);
    RefreshToken.create.mockResolvedValue({});

    await expect(AuthService.refresh('raw-token')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'raw-refresh-token',
    });
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, adminId: admin.id }),
      { transaction }
    );
    expect(generateAccessToken).toHaveBeenCalledWith(admin.id, 'admin');
  });

  it('does nothing when logging out without a refresh token', async () => {
    await AuthService.logout();

    expect(RefreshToken.update).not.toHaveBeenCalled();
  });

  it('revokes an active refresh token on logout', async () => {
    await AuthService.logout('raw-token');

    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { tokenHash: 'hashed-raw-refresh-token', revokedAt: null } }
    );
  });
});
