const { hashPassword, comparePassword } = require('../../../src/utils/passwordHash');

describe('passwordHash', () => {
  const originalWorkFactor = process.env.BCRYPT_WORK_FACTOR;

  afterEach(() => {
    if (originalWorkFactor === undefined) {
      delete process.env.BCRYPT_WORK_FACTOR;
    } else {
      process.env.BCRYPT_WORK_FACTOR = originalWorkFactor;
    }
  });

  it('hashes passwords and verifies matching and non-matching values', async () => {
    process.env.BCRYPT_WORK_FACTOR = '4';

    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    await expect(comparePassword(password, hash)).resolves.toBe(true);
    await expect(comparePassword('incorrect password', hash)).resolves.toBe(false);
  });

  it('produces different hashes given the same password twice', async () => {
    process.env.BCRYPT_WORK_FACTOR = '4';

    const password = 'SecurePass@123';
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
  });

  it('returns true given the correct password', async () => {
    process.env.BCRYPT_WORK_FACTOR = '4';

    const password = 'SecurePass@123';
    const hash = await hashPassword(password);

    await expect(comparePassword(password, hash)).resolves.toBe(true);
  });

  it('returns false given a wrong password', async () => {
    process.env.BCRYPT_WORK_FACTOR = '4';

    const hash = await hashPassword('SecurePass@123');

    await expect(comparePassword('WrongPass@123', hash)).resolves.toBe(false);
  });

  it('defaults to the configured production work factor when unset', async () => {
    delete process.env.BCRYPT_WORK_FACTOR;

    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});
