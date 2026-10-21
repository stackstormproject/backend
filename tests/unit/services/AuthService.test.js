jest.mock('../../../src/models', () => ({
  sequelize: { transaction: jest.fn() },
  Customer: { create: jest.fn(), findOne: jest.fn() },
  Admin: { findOne: jest.fn() },
  Loyalty: { create: jest.fn() },
  RefreshToken: { create: jest.fn() },
}));
jest.mock('../../../src/utils/passwordHash', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));
jest.mock('../../../src/utils/tokenGenerator', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  getRefreshTtlMs: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sequelize, Customer, Admin, Loyalty, RefreshToken } = require('../../../src/models');
const { hashPassword, comparePassword } = require('../../../src/utils/passwordHash');
const {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTtlMs,
} = require('../../../src/utils/tokenGenerator');
const logger = require('../../../src/config/logger');
const AuthService = require('../../../src/services/AuthService');

const transaction = { id: 'transaction' };
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

  it('logs in an admin user and issues an admin session', async () => {
    const admin = {
      id: 99,
      name: 'Super Admin',
      email: 'admin@stackstorm.lk',
      passwordHash: 'hashed-secret',
      role: 'superadmin',
      failedLoginAttempts: 0,
      lockedUntil: null,
      update: jest.fn().mockResolvedValue(true),
    };
    Admin.findOne.mockResolvedValue(admin);
    comparePassword.mockResolvedValue(true);
    generateAccessToken.mockReturnValue('admin-access-token');
    generateRefreshToken.mockReturnValue({
      rawToken: 'admin-refresh-token',
      tokenHash: 'hashed-refresh-token',
    });
    getRefreshTtlMs.mockReturnValue(7 * 24 * 60 * 60 * 1000);

    const result = await AuthService.loginAdmin('admin@stackstorm.lk', 'AdminPass123!');

    expect(result.admin).toEqual({
      id: 99,
      name: 'Super Admin',
      email: 'admin@stackstorm.lk',
      role: 'superadmin',
    });
    expect(result.accessToken).toBe('admin-access-token');
  });
});

