const { LEVEL } = require('triple-beam');
const logger = require('../../../src/config/logger');

const { redactValue } = logger;
const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

describe('redactValue', () => {
  it('redacts sensitive keys recursively while preserving other values', () => {
    const result = redactValue({ user: { email: 'a@example.com', id: 7 }, passwordHash: 'secret' });
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.user.id).toBe(7);
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('returns null and primitive values unchanged', () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
    expect(redactValue('text')).toBe('text');
    expect(redactValue(5)).toBe(5);
  });

  it('redacts objects inside arrays', () => {
    const result = redactValue([{ token: 'abc' }, { id: 1 }]);
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[1].id).toBe(1);
  });

  it('matches sensitive keys case-insensitively', () => {
    const result = redactValue({ Authorization: 'Bearer x', PHONE: '077', cardNumber: '1' });
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.PHONE).toBe('[REDACTED]');
    expect(result.cardNumber).toBe('[REDACTED]');
  });

  it('stops recursing beyond depth five', () => {
    const deep = { a: { b: { c: { d: { e: { f: { password: 'secret' } } } } } } };
    const result = redactValue(deep);
    expect(result.a.b.c.d.e.f).toEqual({ password: 'secret' });
  });
});

describe('logger redact format', () => {
  it('redacts sensitive log fields while preserving level and message', () => {
    const info = logger.format.transform({
      [LEVEL]: 'info',
      level: 'info',
      message: 'login',
      password: 'secret123',
      meta: { cookie: 'session', id: 3 },
    });
    expect(info.message).toBe('login');
    expect(info.password).toBe('[REDACTED]');
    expect(info.meta.cookie).toBe('[REDACTED]');
    expect(info.meta.id).toBe(3);
  });

  it('preserves log entries without extra fields', () => {
    const info = logger.format.transform({ [LEVEL]: 'info', level: 'info', message: 'plain' });
    expect(info.message).toBe('plain');
  });
});

describe('logger configuration', () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    jest.resetModules();
  });

  it('is silent in the test environment', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    expect(require('../../../src/config/logger').silent).toBe(true);
  });

  it('uses the configured level and production settings', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    const productionLogger = require('../../../src/config/logger');
    expect(productionLogger.level).toBe('debug');
    expect(productionLogger.silent).toBe(false);
  });

  it('defaults to info outside production', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    const developmentLogger = require('../../../src/config/logger');
    expect(developmentLogger.level).toBe('info');
    expect(developmentLogger.silent).toBe(false);
  });
});