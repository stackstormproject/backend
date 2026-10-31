const crypto = require('crypto');
const { sequelize, Admin, Customer, Loyalty, RefreshToken } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const { AUTH } = require('../config/constants');
const { hashPassword, comparePassword } = require('../utils/passwordHash');
const {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTtlMs,
  hashToken,
} = require('../utils/tokenGenerator');

let dummyHash;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
function toPublicCustomer(customer) {
  const safe = customer.get({ plain: true });
  delete safe.hashedPassword;
  delete safe.resetTokenHash;
  delete safe.resetTokenExpiresAt;
  delete safe.failedLoginAttempts;
  delete safe.lockedUntil;
  // #3: the avatar-upload and profile endpoints return `avatar_url` (snake_case); the
  // storefront reads that same key off the session customer, so mirror it here too -
  // otherwise a profile picture uploaded earlier silently disappears on the next sign-in.
  safe.avatar_url = safe.avatarUrl || null;
  return safe;
}
async function issueSession(subject, subjectType, { transaction } = {}) {
  const role = subjectType === 'admin' ? subject.role : 'customer';
  const accessToken = generateAccessToken(subject.id, role);
  const { rawToken, tokenHash } = generateRefreshToken();
  await RefreshToken.create(
    {
      customerId: subjectType === 'customer' ? subject.id : null,
      adminId: subjectType === 'admin' ? subject.id : null,
      tokenHash,
      expiresAt: new Date(Date.now() + getRefreshTtlMs()),
    },
    { transaction }
  );
  return { accessToken, refreshToken: rawToken };
}
async function authenticate(Model, subjectType, email, password) {
  const subject = await Model.findOne({ where: { email } });
  if (!subject) {
    await comparePassword(password, await getDummyHash());
    throw invalidCredentials();
  }
  if (subject.lockedUntil && subject.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }
  if (!(await comparePassword(password, subject.hashedPassword))) {
    const attempts = subject.failedLoginAttempts + 1;
    if (attempts >= AUTH.MAX_FAILED_LOGINS) {
      await subject.update({
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + AUTH.LOCK_MINUTES * 60 * 1000),
      });
      logger.warn('Account locked after failed logins', { subjectType, subjectId: subject.id });
    } else {
      await subject.update({ failedLoginAttempts: attempts });
    }
    throw invalidCredentials();
  }
  if (subject.failedLoginAttempts > 0 || subject.lockedUntil) {
    await subject.update({ failedLoginAttempts: 0, lockedUntil: null });
  }
  return subject;
}
async function register({ name, email, password, phone }) {
  const hashedPassword = await hashPassword(password);
  return sequelize.transaction(async (transaction) => {
    const customer = await Customer.create(
      {
        name,
        email,
        phone,
        hashedPassword,
        registrationDate: new Date(),
      },
      { transaction }
    );
    await Loyalty.create(
      {
        customerId: customer.id,
        currentPoints: 0,
        lifetimePoints: 0,
        tier: 'silver',
        tierStartDate: new Date(),
      },
      { transaction }
    );
    const session = await issueSession(customer, 'customer', { transaction });
    logger.info('Customer registered', { customerId: customer.id });
    return { customer: toPublicCustomer(customer), ...session };
  });
}
async function loginCustomer(email, password) {
  const customer = await authenticate(Customer, 'customer', email, password);
  const session = await issueSession(customer, 'customer');
  logger.info('Customer logged in', { customerId: customer.id });
  return { customer: toPublicCustomer(customer), ...session };
}
function toPublicAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
}

async function loginAdmin(email, password) {
  const admin = await authenticate(Admin, 'admin', email, password);
  const session = await issueSession(admin, 'admin');
  logger.info('Admin logged in', { adminId: admin.id, role: admin.role });
  return { admin: toPublicAdmin(admin), ...session };
}
const refreshFailed = (code, message) => new AppError(401, code, message);

/**
 * Rotates a refresh token (ADR-003): the presented token is marked used and a new pair is
 * issued in one transaction. Presenting an already-used token signals theft, so every live
 * session of that subject is revoked (REFRESH_TOKEN_REUSE).
 */
async function refreshSession(rawToken) {
  if (!rawToken) throw refreshFailed('REFRESH_TOKEN_MISSING', 'No refresh token provided.');
  const tokenHash = hashToken(rawToken);

  const result = await sequelize.transaction(async (transaction) => {
    const stored = await RefreshToken.findOne({
      where: { tokenHash },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!stored || stored.revokedAt) {
      throw refreshFailed('INVALID_REFRESH_TOKEN', 'Refresh token is not valid.');
    }
    const subjectWhere = stored.customerId
      ? { customerId: stored.customerId }
      : { adminId: stored.adminId };
    if (stored.usedAt) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { ...subjectWhere, revokedAt: null }, transaction }
      );
      logger.warn('Refresh token reuse detected; all sessions revoked', subjectWhere);
      // Returned, not thrown: throwing here would roll the revocation back.
      return { reuseDetected: true };
    }
    if (stored.expiresAt < new Date()) {
      throw refreshFailed('REFRESH_TOKEN_EXPIRED', 'Your session has expired. Please log in.');
    }

    const subjectType = stored.customerId ? 'customer' : 'admin';
    const Model = stored.customerId ? Customer : Admin;
    const subject = await Model.findByPk(stored.customerId || stored.adminId, { transaction });
    if (!subject) throw refreshFailed('INVALID_REFRESH_TOKEN', 'Refresh token is not valid.');

    await stored.update({ usedAt: new Date() }, { transaction });
    const session = await issueSession(subject, subjectType, { transaction });
    return subjectType === 'customer'
      ? { customer: toPublicCustomer(subject), ...session }
      : { admin: toPublicAdmin(subject), ...session };
  });
  if (result.reuseDetected) {
    throw refreshFailed('REFRESH_TOKEN_REUSE', 'Session ended for security. Please log in.');
  }
  return result;
}

/** Revokes the presented refresh token. Unknown or missing tokens are a silent no-op. */
async function revokeSession(rawToken) {
  if (!rawToken) return;
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash: hashToken(rawToken), revokedAt: null } }
  );
}

/** Public profile for the signed-in admin (name and email for the admin app header). */
async function getAdminProfile(adminId) {
  const admin = await Admin.findByPk(adminId);
  if (!admin) throw new AppError(401, 'INVALID_TOKEN', 'Admin account no longer exists.');
  return toPublicAdmin(admin);
}

module.exports = {
  getAdminProfile,
  refreshSession,
  revokeSession,
  loginAdmin,
  register,
  loginCustomer,
  issueSession,
  authenticate,
  invalidCredentials,
};
