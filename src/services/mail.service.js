const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transport;

/** True when SMTP settings are present, so mail is really sent (#185). */
const isMailConfigured = () => Boolean(process.env.SMTP_HOST);

const getTransport = () => {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transport;
};

/**
 * Sends one email. Without SMTP settings nothing is sent and the message is written to the
 * log instead, so development and CI work without a mail account.
 * @returns {Promise<boolean>} whether the mail was handed to an SMTP server
 */
const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    logger.info('Email not sent (no SMTP_HOST set)', { to, subject, text });
    return false;
  }
  await getTransport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@dickwellafashion.lk',
    to,
    subject,
    text,
    html,
  });
  return true;
};

/** Test helper: forget the cached transport after settings change. */
const resetTransport = () => {
  transport = undefined;
};

module.exports = { sendMail, isMailConfigured, resetTransport };
