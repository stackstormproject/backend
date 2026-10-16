const { hashPassword, comparePassword } = require('../../../src/utils/passwordHash');

describe('passwordHash', () => {
  const originalWorkFactor = process.env.BCRYPT_WORK_FACTOR;

  afterEach(() => {
    if (originalWorkFactor === undefined) delete process.env.BCRYPT_WORK_FACTOR;
    else process.env.BCRYPT_WORK_FACTOR = originalWorkFactor;
  });

  it('hashes passwords and verifies matching and non-matching values', async () => {
    process.env.BCRYPT_WORK_FACTOR = '4';
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    await expect(comparePassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(comparePassword('incorrect password', hash)).resolves.toBe(false);
  });

  it('defaults to the configured production work factor when unset', async () => {
    delete process.env.BCRYPT_WORK_FACTOR;
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});
