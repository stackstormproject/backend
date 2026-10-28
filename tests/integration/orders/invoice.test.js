const request = require('supertest');
const app = require('../../../src/app');
const { sequelize } = require('../../../src/models');
const { createTestVariant, createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #174: customers and staff download a PDF invoice once an order is paid.
describe('Order invoice', () => {
  const binary = (res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  };
  let owner;
  let bearer;
  let orderId;

  beforeAll(async () => {
    owner = await createTestCustomer();
    bearer = `Bearer ${generateAccessToken(owner.id, 'customer')}`;
    const variant = await createTestVariant({ stockQuantity: 5 });
    const res = await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', bearer)
      .send({
        items: [{ variant_id: variant.id, quantity: 2 }],
        shippingAddress: { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' },
      });
    orderId = res.body.data.order_id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const invoice = (bearerToken) =>
    request(app)
      .get(`/api/v1/orders/${orderId}/invoice`)
      .set('Authorization', bearerToken)
      .buffer(true)
      .parse(binary);

  it('should refuse an invoice before payment', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}/invoice`)
      .set('Authorization', bearer);

    expect(res.status).toBe(409);
  });

  it('should send the owner a PDF named after the invoice number once paid', async () => {
    await sequelize.query("UPDATE orders SET status = 'confirmed' WHERE id = :id", {
      replacements: { id: orderId },
    });

    const res = await invoice(bearer);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="DFC-\d{4}-\d+\.pdf"/);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should hide the invoice from other customers and from no one signed in', async () => {
    const stranger = await createTestCustomer();
    const other = await request(app)
      .get(`/api/v1/orders/${orderId}/invoice`)
      .set('Authorization', `Bearer ${generateAccessToken(stranger.id, 'customer')}`);
    const anonymous = await request(app).get(`/api/v1/orders/${orderId}/invoice`);

    expect(other.status).toBe(404);
    expect(anonymous.status).toBe(404);
  });

  it('should let managers download any invoice', async () => {
    const admin = await createAdmin({ email: `inv.${Date.now()}@example.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/orders/${orderId}/invoice`)
      .set('Authorization', `Bearer ${generateAccessToken(admin.id, 'admin')}`)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    const missing = await request(app)
      .get('/api/v1/admin/orders/99999999/invoice')
      .set('Authorization', `Bearer ${generateAccessToken(admin.id, 'admin')}`);
    expect(missing.status).toBe(404);
  });
});
