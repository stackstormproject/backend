jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../../../src/config/logger', () => ({ info: jest.fn() }));

const nodemailer = require('nodemailer');
const logger = require('../../../src/config/logger');
const {
  sendMail,
  isMailConfigured,
  resetTransport,
} = require('../../../src/services/mail.service');

// Refs #185
describe('mail service', () => {
  const env = { ...process.env };
  const send = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    resetTransport();
    nodemailer.createTransport.mockReturnValue({ sendMail: send });
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.MAIL_FROM;
  });
  afterAll(() => {
    process.env = env;
  });
  const mail = { to: 'a@example.lk', subject: 'Hi', text: 'Body', html: '<p>Body</p>' };

  it('should log instead of sending without SMTP settings', async () => {
    expect(isMailConfigured()).toBe(false);
    await expect(sendMail(mail)).resolves.toBe(false);
    expect(logger.info).toHaveBeenCalledWith('Email not sent (no SMTP_HOST set)', {
      to: 'a@example.lk',
      subject: 'Hi',
      text: 'Body',
    });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('should send through SMTP with login and reuse the connection', async () => {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'shop@gmail.com',
      SMTP_PASS: 'app-password',
    });

    await expect(sendMail(mail)).resolves.toBe(true);
    await sendMail(mail);

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'shop@gmail.com', pass: 'app-password' },
    });
    expect(send).toHaveBeenCalledWith({ from: 'shop@gmail.com', ...mail });
  });

  it('should default to port 587 without login and use MAIL_FROM', async () => {
    Object.assign(process.env, { SMTP_HOST: 'localhost', MAIL_FROM: 'Shop <shop@x.lk>' });

    await sendMail(mail);

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 587,
      secure: false,
      auth: undefined,
    });
    expect(send.mock.calls[0][0].from).toBe('Shop <shop@x.lk>');
  });

  it('should fall back to the shop address without MAIL_FROM or a login', async () => {
    process.env.SMTP_HOST = 'localhost';
    await sendMail(mail);
    expect(send.mock.calls[0][0].from).toBe('noreply@dickwellafashion.lk');
  });
});
