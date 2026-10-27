const request = require('supertest');
const app = require('../../../src/app');
const { ProductVariant, sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #135: stock list, adjustments with an audit trail, and the low-stock view (FR017, FR018).
describe('Admin inventory', () => {
  let adminBearer;
  let admin;

  beforeAll(async () => {
    admin = await createAdmin({ email: `inv.${Date.now()}@example.com`, role: 'admin' });
    adminBearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const adjust = (variantId, body, bearer = adminBearer) =>
    request(app)
      .post(`/api/v1/admin/inventory/${variantId}/adjust`)
      .set('Authorization', bearer)
      .send(body);

  it('should add stock and record who did it and why', async () => {
    const variant = await createTestVariant({ stockQuantity: 4 });

    const res = await adjust(variant.id, { delta: 6, reason: 'restock', note: 'Weekly delivery' });
    const logs = await request(app)
      .get(`/api/v1/admin/inventory/${variant.id}/logs`)
      .set('Authorization', adminBearer);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ stock_quantity: 10, available: 10, is_low: false });
    expect(logs.body.data.logs[0]).toMatchObject({
      change_quantity: 6,
      reason: 'restock: Weekly delivery',
      admin_name: admin.name,
    });
    expect(logs.body.data.reasons).toContain('damaged');
  });

  it('should refuse to drop stock below units held in active checkouts', async () => {
    const variant = await createTestVariant({ stockQuantity: 5, reservedQuantity: 3 });

    const res = await adjust(variant.id, { delta: -3, reason: 'damaged' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/held in active checkouts/);
    expect((await ProductVariant.findByPk(variant.id)).stockQuantity).toBe(5);
  });

  it.each([
    [{ delta: 0, reason: 'restock' }, /whole number/],
    [{ delta: 1.5, reason: 'restock' }, /whole number/],
    [{ delta: 2, reason: 'because' }, /Reason must be one of/],
    [{ delta: 2, reason: 'other' }, /Add a note/],
  ])('should reject %j', async (body, message) => {
    const variant = await createTestVariant({ stockQuantity: 5 });

    const res = await adjust(variant.id, body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('should return 404 for an unknown variant', async () => {
    expect((await adjust(999999, { delta: 1, reason: 'restock' })).status).toBe(404);
  });

  it('should list low-stock variants lowest first and search by SKU', async () => {
    const low = await createTestVariant({ stockQuantity: 2, reservedQuantity: 1 });

    const lowList = await request(app)
      .get('/api/v1/admin/inventory?low=true&limit=100')
      .set('Authorization', adminBearer);
    const search = await request(app)
      .get(`/api/v1/admin/inventory?search=${encodeURIComponent(low.sku)}`)
      .set('Authorization', adminBearer);

    expect(lowList.status).toBe(200);
    const available = lowList.body.data.items.map((i) => i.available);
    expect([...available].sort((a, b) => a - b)).toEqual(available);
    expect(lowList.body.data.items.every((i) => i.is_low)).toBe(true);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0]).toMatchObject({ variant_id: low.id, available: 1 });
    expect(search.body.data.low_stock_threshold).toBe(5);
  });

  it('should be closed to customers and support agents', async () => {
    const variant = await createTestVariant({ stockQuantity: 5 });
    const customer = await createTestCustomer();
    const agent = await createAdmin({
      email: `agent.${Date.now()}@example.com`,
      role: 'support_agent',
    });

    const asCustomer = await adjust(
      variant.id,
      { delta: 1, reason: 'restock' },
      `Bearer ${generateAccessToken(customer.id, 'customer')}`
    );
    const asAgent = await request(app)
      .get('/api/v1/admin/inventory')
      .set('Authorization', `Bearer ${generateAccessToken(agent.id, 'support_agent')}`);

    expect(asCustomer.status).toBe(403);
    expect(asAgent.status).toBe(403);
  });
});
