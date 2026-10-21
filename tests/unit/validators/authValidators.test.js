const { registerRules, loginRules, emailRule } = require('../../../src/validators/auth.validators');

describe('auth.validators', () => {
  it('should export registerRules array with validation middlewares', () => {
    expect(Array.isArray(registerRules)).toBe(true);
    expect(registerRules.length).toBeGreaterThan(0);
  });

  it('should export loginRules array with validation middlewares', () => {
    expect(Array.isArray(loginRules)).toBe(true);
    expect(loginRules.length).toBeGreaterThan(0);
  });

  it('should export emailRule validation middleware', () => {
    expect(emailRule).toBeDefined();
    expect(typeof emailRule.run).toBe('function');
  });
});
