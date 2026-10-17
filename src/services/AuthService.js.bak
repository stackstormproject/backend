const crypto = require('crypto');
const { sequelize, Customer, Loyalty, RefreshToken } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const { AUTH } = require('../config/constants');
const { hashPassword, comparePassword } = require('../utils/passwordHash');
const {
  generateAccessToken,
  generateRefreshToken,
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
module.exports = {
  register,
  loginCustomer,
  issueSession,
  authenticate,
  invalidCredentials,
};
