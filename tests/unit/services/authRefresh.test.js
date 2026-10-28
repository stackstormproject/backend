jest.mock('../../../src/models', () => ({
  sequelize: { transaction: jest.fn() },
  Customer: { findByPk: jest.fn() },
  Admin: { findByPk: jest.fn() },
  Loyalty: {},
  RefreshToken: { findOne: jest.fn(), update: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../src/utils/tokenGenerator', () => ({
  generateAccessToken: jest.fn(() => 'new-access'),
  generateRefreshToken: jest.fn(() => ({ rawToken: 'new-refresh', tokenHash: 'new-hash' })),
  getRefreshTtlMs: jest.fn(() => 1000),
  hashToken: jest.fn((raw) => `hash-of-${raw}`),
}));
jest.mock('../../../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn() }));

const { sequelize, Customer, Admin, RefreshToken } = require('../../../src/models');
const logger = require('../../../src/config/logger');
const { refreshSession, revokeSession } = require('../../../src/services/AuthService');

// Refs #105: refresh-token rotation and reuse detection (ADR-003), unit level.
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const future = () => new Date(Date.now() + 60000);
const stored = (overrides = {}) => ({
  customerId: 7,
  adminId: null,
  usedAt: null,
  revokedAt: null,
  expiresAt: future(),
  update: jest.fn(),
  ...overrides,
});
const customer = {
  id: 7,
  get: () => ({ id: 7, email: 'alice@example.com', hashedPassword: 'secret', lockedUntil: null }),
};

describe('AuthService.refreshSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation((cb) => cb(transaction));
  });

  it('should refuse a missing token without touching the database', async () => {
    await expect(refreshSession(undefined)).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_TOKEN_MISSING',
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('should look the token up by its hash under a row lock', async () => {
    RefreshToken.findOne.mockResolvedValue(null);

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(RefreshToken.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: 'hash-of-raw' }, lock: 'UPDATE' })
    );
  });

  it('should refuse a revoked token', async () => {
    RefreshToken.findOne.mockResolvedValue(stored({ revokedAt: new Date() }));

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('should revoke every session of a customer given a reused token', async () => {
    RefreshToken.findOne.mockResolvedValue(stored({ usedAt: new Date() }));

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSE' });
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { customerId: 7, revokedAt: null }, transaction }
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should revoke every session of an admin given a reused token', async () => {
    RefreshToken.findOne.mockResolvedValue(
      stored({ customerId: null, adminId: 3, usedAt: new Date() })
    );

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSE' });
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { adminId: 3, revokedAt: null }, transaction }
    );
  });

  it('should refuse an expired token', async () => {
    RefreshToken.findOne.mockResolvedValue(stored({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
  });

  it('should refuse a token whose account no longer exists', async () => {
    RefreshToken.findOne.mockResolvedValue(stored());
    Customer.findByPk.mockResolvedValue(null);

    await expect(refreshSession('raw')).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('should mark the token used and issue a new customer session', async () => {
    const token = stored();
    RefreshToken.findOne.mockResolvedValue(token);
    Customer.findByPk.mockResolvedValue(customer);

    const result = await refreshSession('raw');

    expect(token.update).toHaveBeenCalledWith({ usedAt: expect.any(Date) }, { transaction });
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 7, adminId: null, tokenHash: 'new-hash' }),
      { transaction }
    );
    expect(result).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(result.customer).toEqual({ id: 7, email: 'alice@example.com' });
  });

  it('should issue an admin session with the admin profile only', async () => {
    RefreshToken.findOne.mockResolvedValue(stored({ customerId: null, adminId: 3 }));
    Admin.findByPk.mockResolvedValue({
      id: 3,
      name: 'Super Admin',
      email: 'admin@stackstorm.lk',
      role: 'super_admin',
      hashedPassword: 'secret',
    });

    const result = await refreshSession('raw');

    expect(result.admin).toEqual({
      id: 3,
      name: 'Super Admin',
      email: 'admin@stackstorm.lk',
      role: 'super_admin',
    });
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, adminId: 3 }),
      { transaction }
    );
  });
});

describe('AuthService.revokeSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should do nothing without a token', async () => {
    await revokeSession(undefined);

    expect(RefreshToken.update).not.toHaveBeenCalled();
  });

  it('should revoke only the presented, still-active token', async () => {
    await revokeSession('raw');

    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { tokenHash: 'hash-of-raw', revokedAt: null } }
    );
  });
});
