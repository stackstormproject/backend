const express = require('express');
const request = require('supertest');
const { createLimiter, createReserveLimiter } = require('../../../src/middleware/rateLimiter');

const makeApp = (limit) => {
  const app = express();
  app.get('/x', createLimiter({ windowMs: 60000, limit, message: 'slow' }), (req, res) =>
    res.json({})
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

  it('should key createReserveLimiter by user id or fallback to ip', async () => {
    process.env.DISABLE_RATE_LIMIT = 'false';
    const limiter = createReserveLimiter({ limit: 5 });
    const app = express();
    app.use((req, res, next) => {
      req.user = { userId: 42 };
      next();
    });
    app.get('/reserve', limiter, (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/reserve');
    expect(res.status).toBe(200);

    const guestApp = express();
    guestApp.get('/reserve-guest', limiter, (req, res) => res.json({ ok: true }));
    const guestRes = await request(guestApp).get('/reserve-guest');
    expect(guestRes.status).toBe(200);
  });
});
