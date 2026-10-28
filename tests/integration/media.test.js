/* eslint-disable global-require -- modules are reloaded after the environment changes */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// Refs #172: without S3, uploaded product images are saved on disk and served under /api/v1/media.
describe('Local image uploads', () => {
  const saved = { ...process.env };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackstorm-media-'));
  let app;
  let bearer;

  beforeAll(() => {
    process.env.UPLOAD_DIR = dir;
    process.env.STORAGE_DRIVER = 'local';
    process.env.FORCE_S3_STORAGE = 'true'; // leave the test-only memory storage
    jest.resetModules();
    app = require('../../src/app');
    const { generateAccessToken } = require('../../src/utils/tokenGenerator');
    bearer = `Bearer ${generateAccessToken(1, 'admin')}`;
  });

  afterAll(async () => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
    await require('../../src/models').sequelize.close();
  });

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  it('should save images to disk with random names and serve them back', async () => {
    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Authorization', bearer)
      .attach('images', png, { filename: '../../evil name.png', contentType: 'image/png' })
      .attach('images', png, { filename: 'back.webp', contentType: 'image/webp' });

    expect(res.status).toBe(201);
    const { urls } = res.body.data;
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/^\/api\/v1\/media\/products\/[0-9a-f-]{36}\.png$/);
    expect(urls[1]).toMatch(/\.webp$/);
    expect(fs.readdirSync(path.join(dir, 'products'))).toHaveLength(2);

    const served = await request(app).get(urls[0]);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('should return 404 for a missing image and refuse path tricks', async () => {
    expect((await request(app).get('/api/v1/media/products/missing.png')).status).toBe(404);
    expect((await request(app).get('/api/v1/media/../package.json')).status).toBe(404);
  });
});
