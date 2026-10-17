const crypto = require('crypto');
const { sequelize, Admin, Customer, Loyalty, RefreshToken } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const { AUTH } = require('../config/constants');
const { hashPassword, comparePassword } = require('../utils/passwordHash');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTtlMs,
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
const ownerWhere = (stored) =>
  stored.customerId ? { customerId: stored.customerId } : { adminId: stored.adminId };

async function revokeAllSessions(where, transaction) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { ...where, revokedAt: null }, transaction }
  );
}

async function refresh(rawToken) {
  if (!rawToken) throw new AppError(401, 'NO_REFRESH_TOKEN', 'No refresh token provided.');

  // Failures are returned inside the transaction and thrown after the commit,
  // so the revoke-all on token reuse is not rolled back.
  const outcome = await sequelize.transaction(async (transaction) => {
    const stored = await RefreshToken.findOne({
      where: { tokenHash: hashToken(rawToken) },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!stored || stored.revokedAt) {
      return { error: new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not valid.') };
    }
    if (stored.expiresAt <= new Date()) {
      return {
        error: new AppError(
          401,
          'REFRESH_TOKEN_EXPIRED',
          'Refresh token has expired. Please log in again.'
        ),
      };
    }
    if (stored.usedAt) {
      if (Date.now() - stored.usedAt.getTime() <= AUTH.REFRESH_REUSE_GRACE_SECONDS * 1000) {
        return {
          error: new AppError(
            409,
            'REFRESH_IN_PROGRESS',
            'This token was just used. Retry with the newest token.'
          ),
        };
      }
      await revokeAllSessions(ownerWhere(stored), transaction);
      logger.warn('Refresh token reuse detected, all sessions revoked', ownerWhere(stored));
      return {
        error: new AppError(
          401,
          'REFRESH_TOKEN_REUSE',
          'Refresh token reuse detected. All sessions were terminated.'
        ),
      };
    }

    const subjectType = stored.customerId ? 'customer' : 'admin';
    const subject =
      subjectType === 'customer'
        ? await Customer.findByPk(stored.customerId, { transaction })
        : await Admin.findByPk(stored.adminId, { transaction });
    if (!subject) {
      return { error: new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not valid.') };
    }

    await stored.update({ usedAt: new Date() }, { transaction });
    return { session: await issueSession(subject, subjectType, { transaction }) };
  });

  if (outcome.error) throw outcome.error;
  return outcome.session;
}

async function logout(rawToken) {
  if (!rawToken) return;
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash: hashToken(rawToken), revokedAt: null } }
  );
}
module.exports = {
  refresh,
  logout,
  register,
  loginCustomer,
  issueSession,
  authenticate,
  invalidCredentials,
};
