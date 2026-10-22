process.env.RESERVE_RATE_LIMIT = '1000';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { createReserveLimiter } = require('../../../src/middleware/reserveLimiter');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');

const tokenFor = (id, role = 'customer') =>
  jwt.sign({ id, role }, process.env.JWT_SECRET || 'test-secret');
const reserve = (token, items) =>
  request(app)
    .post('/api/v1/inventory/reserve')
    .set('Authorization', `Bearer ${token}`)
    .send({ items });

describe('Reservation API', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should return 401 given no token (AC2)', async () => {
    const res = await request(app).post('/api/v1/inventory/reserve').send({ items: [] });
    expect(res.status).toBe(401);
  });

  it('should return 403 given an admin token', async () => {
    const res = await reserve(tokenFor(1, 'admin'), [{ variant_id: 1, quantity: 1 }]);
    expect(res.status).toBe(403);
  });

  it('should return 400 given an invalid body (AC3)', async () => {
    const c = await createTestCustomer();
    const token = tokenFor(c.id);
    expect((await reserve(token, [])).status).toBe(400);
    expect((await reserve(token, [{ variant_id: 'abc', quantity: 1 }])).status).toBe(400);
    expect((await reserve(token, [{ variant_id: 1, quantity: 99 }])).status).toBe(400);
  });

  it('should reserve and return 200 with expiry (AC1)', async () => {
    const c = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 5 });

    const res = await reserve(tokenFor(c.id), [{ variant_id: v.id, quantity: 2 }]);

    expect(res.status).toBe(200);
    expect(res.body.data.expires_in).toBe(900);
    expect(res.body.data.reservation_id).toMatch(/^res_/);
  });

  it('should return 409 given insufficient stock', async () => {
    const c = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 1 });

    const res = await reserve(tokenFor(c.id), [{ variant_id: v.id, quantity: 2 }]);

    expect(res.status).toBe(409);
  });

  it('should release the old hold given the same customer reserves again (AC5)', async () => {
    const c = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 5 });
    const token = tokenFor(c.id);

    await reserve(token, [{ variant_id: v.id, quantity: 3 }]);
    await reserve(token, [{ variant_id: v.id, quantity: 3 }]);

    await v.reload();
    expect(v.reservedQuantity).toBe(3); // not 6
  });

  it("should return 403 given a customer releases another customer's hold", async () => {
    const owner = await createTestCustomer();
    const other = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 5 });
    const made = await reserve(tokenFor(owner.id), [{ variant_id: v.id, quantity: 1 }]);

    const res = await request(app)
      .delete(`/api/v1/inventory/reservations/${made.body.data.reservation_id}`)
      .set('Authorization', `Bearer ${tokenFor(other.id)}`);

    expect(res.status).toBe(403);
  });

  it('should release the owner hold, then return 409 on a repeat', async () => {
    const c = await createTestCustomer();
    const v = await createTestVariant({ stockQuantity: 5 });
    const token = tokenFor(c.id);
    const made = await reserve(token, [{ variant_id: v.id, quantity: 1 }]);
    const url = `/api/v1/inventory/reservations/${made.body.data.reservation_id}`;

    const first = await request(app).delete(url).set('Authorization', `Bearer ${token}`);
    const second = await request(app).delete(url).set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('should return 429 after the limit is exceeded (AC4)', async () => {
    const tiny = express();
    tiny.use((req, res, next) => {
      req.user = { id: 1 };
      next();
    });
    tiny.post('/x', createReserveLimiter({ limit: 2 }), (req, res) => res.json({ ok: true }));

    await request(tiny).post('/x');
    await request(tiny).post('/x');
    const third = await request(tiny).post('/x');

    expect(third.status).toBe(429);
  });
});
