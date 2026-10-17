const express = require('express');
const request = require('supertest');
const { createLimiter } = require('../../../src/middleware/rateLimiter');

const makeApp = (limit) => {
  const app = express();
  app.get(
    '/x',
    createLimiter({ windowMs: 60000, limit, message: 'slow' }),
    (req, res) => res.json({})
  );
  return app;
};

describe('createLimiter', () => {
  afterEach(() => {
    process.env.DISABLE_RATE_LIMIT = 'true';
  });

  it('should return 429 TOO_MANY_REQUESTS given the limit is exceeded', async () => {
    process.env.DISABLE_RATE_LIMIT = 'false';
    const app = makeApp(2);

    await request(app).get('/x');
    await request(app).get('/x');
    const third = await request(app).get('/x');

    expect(third.status).toBe(429);
    expect(third.body.error).toBe('TOO_MANY_REQUESTS');
  });

  it('should never limit given DISABLE_RATE_LIMIT is true', async () => {
    const app = makeApp(1);

    await request(app).get('/x');
    const second = await request(app).get('/x');

    expect(second.status).toBe(200);
  });
});