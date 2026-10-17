const { LEVEL } = require('triple-beam');
const logger = require('../../../src/config/logger');

const { redactValue } = logger;

describe('redactValue', () => {
  it('should redact sensitive keys given a nested object', () => {
    const result = redactValue({ user: { email: 'a@b.lk', id: 7 }, passwordHash: 'x' });
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.user.id).toBe(7);
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('should return null and primitives unchanged', () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
    expect(redactValue('text')).toBe('text');
    expect(redactValue(5)).toBe(5);
  });

  it('should redact inside arrays', () => {
    const result = redactValue([{ token: 'abc' }, { id: 1 }]);
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[1].id).toBe(1);
  });

  it('should match keys case-insensitively', () => {
    const result = redactValue({ Authorization: 'Bearer x', PHONE: '077', cardNumber: '1' });
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.PHONE).toBe('[REDACTED]');
    expect(result.cardNumber).toBe('[REDACTED]');
  });

  it('should stop recursing beyond depth 5', () => {
    const deep = { a: { b: { c: { d: { e: { f: { password: 'x' } } } } } } };
    const result = redactValue(deep);
    expect(result.a.b.c.d.e.f).toEqual({ password: 'x' });
  });
});

describe('logger redact format', () => {
  it('should redact sensitive fields but keep level and message', () => {
    const info = logger.format.transform({
      [LEVEL]: 'info',
      level: 'info',
      message: 'login',
      password: 'secret123',
      meta: { cookie: 'c', id: 3 },
    });
    expect(info.message).toBe('login');
    expect(info.password).toBe('[REDACTED]');
    expect(info.meta.cookie).toBe('[REDACTED]');
    expect(info.meta.id).toBe(3);
  });

  it('should leave entries with no extra fields intact', () => {
    const info = logger.format.transform({ [LEVEL]: 'info', level: 'info', message: 'plain' });
    expect(info.message).toBe('plain');
  });
});

describe('logger configuration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  it('should be silent when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    const testLogger = require('../../../src/config/logger');
    expect(testLogger.silent).toBe(true);
  });

  it('should use json format and LOG_LEVEL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    const prodLogger = require('../../../src/config/logger');
    expect(prodLogger.level).toBe('debug');
    expect(prodLogger.silent).toBe(false);
  });

  it('should default to info level outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    const devLogger = require('../../../src/config/logger');
    expect(devLogger.level).toBe('info');
    expect(devLogger.silent).toBe(false);
  });
});
