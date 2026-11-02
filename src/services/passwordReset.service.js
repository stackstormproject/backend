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

const resetEmail = (name, link) => {
  const safeName = name.replace(/[<>&"]/g, '');

  return {
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
    // Table layout with inlined styles throughout: the only way an email renders
    // consistently across Gmail, Outlook and mobile mail apps, none of which can be
    // trusted to apply an external or even a <head> stylesheet the same way twice.
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Reset your Dickwella Fashion Corner password</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(10,25,47,0.08);">
            <tr>
              <td align="center" style="background-color:#0a192f; padding:28px 24px;">
                <span style="display:inline-block; font-size:12px; letter-spacing:2.5px; text-transform:uppercase; color:#d4af37; font-weight:600;">
                  Dickwella Fashion Corner
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <p style="margin:0 0 20px; font-size:22px; line-height:1.3; font-weight:700; color:#0a192f;">
                  Reset your password
                </p>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#334155;">
                  Hello ${safeName},
                </p>
                <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#334155;">
                  We received a request to reset your password. Click the button below to
                  choose a new one.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:8px; background-color:#d4af37;">
                      <a href="${link}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:700; color:#0a192f; text-decoration:none; border-radius:8px;">
                        Choose a new password
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0 0 16px; font-size:13px; line-height:1.6; color:#64748b;">
                  Button not working? Paste this link into your browser instead:<br />
                  <a href="${link}" style="color:#0a192f; word-break:break-all;">${link}</a>
                </p>
                <p style="margin:0; font-size:13px; line-height:1.6; color:#64748b;">
                  This link works for ${AUTH.RESET_TOKEN_MINUTES} minutes and only once. If
                  you did not ask for this, ignore this email - your password stays the same.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#94a3b8; text-align:center;">
                  Dickwella Fashion Corner &middot; Main Street, Dickwella, Sri Lanka
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
};

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
