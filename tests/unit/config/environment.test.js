const { validateEnvironment } = require('../../../src/config/environment');
const validEnv = {
NODE_ENV: 'test',
DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
JWT_SECRET: 'a'.repeat(32),
  BCRYPT_WORK_FACTOR: '4',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
};
describe('validateEnvironment', () => {
  it('should not throw given a complete valid environment', () => {
    expect(() => validateEnvironment(validEnv)).not.toThrow();
  });
  it('should throw naming DATABASE_URL given it is missing', () => {
    const env = { ...validEnv, DATABASE_URL: undefined };
    expect(() => validateEnvironment(env)).toThrow('DATABASE_URL');
  });
  it('should throw given a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnvironment({ ...validEnv, JWT_SECRET: 'short' 
})).toThrow('JWT_SECRET');
  });
  it('should throw given a bcrypt work factor below 12 in production', () => 
{
    const env = { ...validEnv, NODE_ENV: 'production', BCRYPT_WORK_FACTOR: 
'10' };
    expect(() => validateEnvironment(env)).toThrow('BCRYPT_WORK_FACTOR');
  });
  it('should throw given a malformed REFRESH_TOKEN_EXPIRES_IN', () => {
    const env = { ...validEnv, REFRESH_TOKEN_EXPIRES_IN: 'soon' };
    expect(() => 
validateEnvironment(env)).toThrow('REFRESH_TOKEN_EXPIRES_IN');
  });
});