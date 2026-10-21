const request = require('supertest');
const app = require('../../src/app');
const { generateAccessToken } = require('../../src/utils/tokenGenerator');

describe('POST /api/v1/upload/images - Media Pipeline Integration', () => {
  let adminToken;

  beforeAll(() => {
    adminToken = generateAccessToken(1, 'admin');
  });

  it('should return 401 UNAUTHORIZED when no authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/v1/upload/images')
      .attach('images', Buffer.from('image payload'), {
        filename: 'shirt.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(401);
  });

  it('should return 400 when invalid MIME type is uploaded (e.g., text/plain)', async () => {
    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', Buffer.from('plain text content'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('should return 400 when no files are attached to the request', async () => {
    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('should upload valid image PNG and return 201 with secure URL', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', pngBuffer, {
        filename: 'sample-shirt.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.urls)).toBe(true);
    expect(res.body.data.urls).toHaveLength(1);
    expect(res.body.data.urls[0]).toMatch(/^https?:\/\/.+/);
  });

  it('should support multiple images up to limit of 5', async () => {
    const webpBuffer = Buffer.from('RIFF....WEBPVP8 ', 'utf8');

    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', webpBuffer, { filename: 'front.webp', contentType: 'image/webp' })
      .attach('images', webpBuffer, { filename: 'back.webp', contentType: 'image/webp' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.urls).toHaveLength(2);
  });
});
