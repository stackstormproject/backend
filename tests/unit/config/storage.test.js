/* eslint-disable global-require -- modules are reloaded after the environment changes */
const path = require('path');

// Refs #172: images go to local disk unless S3 is explicitly configured.
describe('storage config', () => {
  const saved = { ...process.env };
  const load = () => {
    jest.resetModules();
    return require('../../../src/config/storage');
  };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('should use local disk when STORAGE_DRIVER is local', () => {
    process.env.STORAGE_DRIVER = 'local';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAREAL';

    expect(load().useLocalStorage()).toBe(true);
  });

  it('should use S3 when STORAGE_DRIVER is s3', () => {
    process.env.STORAGE_DRIVER = 's3';

    expect(load().useLocalStorage()).toBe(false);
  });

  it.each([undefined, 'xxx'])('should fall back to local disk when the AWS key is %p', (key) => {
    delete process.env.STORAGE_DRIVER;
    if (key) process.env.AWS_ACCESS_KEY_ID = key;
    else delete process.env.AWS_ACCESS_KEY_ID;

    expect(load().useLocalStorage()).toBe(true);
  });

  it('should use S3 when real AWS keys are set', () => {
    delete process.env.STORAGE_DRIVER;
    process.env.AWS_ACCESS_KEY_ID = 'AKIAREAL';

    expect(load().useLocalStorage()).toBe(false);
  });

  it('should build media URLs and resolve the upload folder', () => {
    process.env.UPLOAD_DIR = 'tmp-uploads';
    const storage = load();

    expect(storage.mediaUrl('products/a.jpg')).toBe('/api/v1/media/products/a.jpg');
    expect(storage.UPLOAD_DIR).toBe(path.resolve('tmp-uploads'));
  });
});
