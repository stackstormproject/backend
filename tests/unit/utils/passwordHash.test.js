const { hashPassword, comparePassword } = require('../../../src/utils/passwordHash');

describe('passwordHash', () => {
  it('should return a bcrypt hash that differs from the password given a plain password', async () => {
    const hash = await hashPassword('SecurePass@123');
    expect(hash).not.toBe('SecurePass@123');
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  it('should produce different hashes given the same password twice', async () => {
    const first = await hashPassword('SecurePass@123');
    const second = await hashPassword('SecurePass@123');
    expect(first).not.toBe(second);
  });

  it('should return true given the correct password', async () => {
    const hash = await hashPassword('SecurePass@123');
    expect(await comparePassword('SecurePass@123', hash)).toBe(true);
  });

  it('should return false given a wrong password', async () => {
    const hash = await hashPassword('SecurePass@123');
    expect(await comparePassword('WrongPass@123', hash)).toBe(false);
  });
});