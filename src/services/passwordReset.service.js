const crypto = require('crypto');
const { sequelize, Customer, RefreshToken } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const { AUTH } = require('../config/constants');
const { hashPassword } = require('../utils/passwordHash');
const { hashToken } = require('../utils/tokenGenerator');
const { storefrontUrl } = require('../utils/storefrontUrl');
const { sendMail, isMailConfigured } = require('./mail.service');

const invalidLink = () =>
  new AppError(
    400,
    'INVALID_RESET_TOKEN',
    'This reset link is not valid or has expired. Ask for a new one.'
  );

const resetEmail = (name, link) => ({
  subject: 'Reset your Dickwella Fashion Corner password',
  text: [
    `Hello ${name},`,
    '',
    'We received a request to reset your password. Open this link to choose a new one:',
    link,
    '',
    `The link works for ${AUTH.RESET_TOKEN_MINUTES} minutes and only once.`,
    'If you did not ask for this, ignore this email; your password stays the same.',
    '',
    'Dickwella Fashion Corner',
  ].join('\n'),
  html: `<p>Hello ${name.replace(/[<>&"]/g, '')},</p>
<p>We received a request to reset your password.</p>
<p><a href="${link}">Choose a new password</a></p>
<p>The link works for ${AUTH.RESET_TOKEN_MINUTES} minutes and only once. If you did not ask
for this, ignore this email; your password stays the same.</p>
<p>Dickwella Fashion Corner</p>`,
});

/**
 * Starts a password reset (#185). Always answers the same way, whether or not the email has
 * an account, so the form cannot be used to find out who shops here. Only a hash of the
 * one-time token is stored.
 *
 * @returns {Promise<{ devResetUrl?: string }>} the link itself only outside production when
 *   no mail server is set up, so the flow can be tried locally
 */
async function requestReset(email) {
  const customer = await Customer.findOne({ where: { email } });
  if (!customer) return {};

  const rawToken = crypto.randomBytes(32).toString('hex');
  await customer.update({
    resetTokenHash: hashToken(rawToken),
    resetTokenExpiresAt: new Date(Date.now() + AUTH.RESET_TOKEN_MINUTES * 60 * 1000),
  });
  const link = `${storefrontUrl()}/reset-password?token=${rawToken}`;
  try {
    await sendMail({ to: customer.email, ...resetEmail(customer.name, link) });
  } catch (error) {
    // The answer stays the same; the customer can ask again.
    logger.error('Password reset email failed', { customerId: customer.id, error: error.message });
  }
  logger.info('Password reset requested', { customerId: customer.id });
  const showLink = !isMailConfigured() && process.env.NODE_ENV !== 'production';
  return showLink ? { devResetUrl: link } : {};
}

/**
 * Sets a new password from a reset link. The link works once; every signed-in session ends
 * and any lock from failed sign-ins is lifted.
 */
async function resetPassword(rawToken, password) {
  if (!rawToken) throw invalidLink();
  const customer = await Customer.findOne({ where: { resetTokenHash: hashToken(rawToken) } });
  if (!customer || !customer.resetTokenExpiresAt || customer.resetTokenExpiresAt < new Date()) {
    throw invalidLink();
  }
  const hashedPassword = await hashPassword(password);
  await sequelize.transaction(async (transaction) => {
    await customer.update(
      {
        hashedPassword,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      { transaction }
    );
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { customerId: customer.id, revokedAt: null }, transaction }
    );
  });
  logger.info('Password reset completed', { customerId: customer.id });
}

module.exports = { requestReset, resetPassword };
