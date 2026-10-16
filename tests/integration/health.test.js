const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/health', () => {
  it('should return 200 with status ok given the app is running', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('should return 404 with NOT_FOUND given an unknown route', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });
});