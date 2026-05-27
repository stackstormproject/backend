const request = require('supertest');
const app = require('../../index');

describe('Integration: Health Check', () => {
  describe('GET /api/health', () => {
    it('should return status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('ok');
    });

    it('should have correct content-type', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Server Security Headers', () => {
    it('should have helmet security headers', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('CORS Support', () => {
    it('should allow cross-origin requests', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
