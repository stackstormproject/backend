const request = require('supertest');
const app = require('../../src/app');
const { resetDatabase, createCustomer, sequelize } = require('../helpers/db');
const { Customer } = require('../../src/models');
const paymentMethodService = require('../../src/services/paymentMethod.service');

// Refs #190 (FR-010): saved cards in the account.
describe('saved payment methods', () => {
  let bearer;
  let customerId;
  beforeEach(async () => {
    await resetDatabase();
    await createCustomer();
    customerId = (await Customer.findOne({ where: { email: 'alice@example.com' } })).id;
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass@123' });
    bearer = `Bearer ${login.body.accessToken}`;
  });
  afterAll(() => sequelize.close());

  const api = (method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', bearer);
  const card = (ref, last4) => ({
    provider: 'stripe',
    providerRef: ref,
    brand: 'mastercard',
    last4,
    expMonth: 3,
    expYear: 2030,
  });

  it('should list saved cards with the first as default and switch the default', async () => {
    await paymentMethodService.saveTestCard(customerId);
    await paymentMethodService.saveTestCard(customerId); // same card is not duplicated
    await paymentMethodService.save(customerId, card('pm_a', '5555'));

    let list = await api('get', '/users/me/payment-methods');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0]).toMatchObject({
      brand: 'visa',
      last4: '4242',
      is_default: true,
      is_test: true,
    });
    expect(list.body.data[0]).not.toHaveProperty('provider_ref');

    const other = list.body.data[1];
    list = await api('patch', `/users/me/payment-methods/${other.id}/default`);
    expect(list.body.data[0]).toMatchObject({ id: other.id, is_default: true });
    expect(list.body.data.filter((c) => c.is_default)).toHaveLength(1);
  });

  it('should remove a card and pass the default to another', async () => {
    const first = await paymentMethodService.save(customerId, card('pm_a', '1111'));
    await paymentMethodService.save(customerId, card('pm_b', '2222'));

    const after = await api('delete', `/users/me/payment-methods/${first.id}`);

    expect(after.status).toBe(200);
    expect(after.body.data).toEqual([expect.objectContaining({ last4: '2222', is_default: true })]);
  });

  it('should keep other customers out', async () => {
    const theirs = await paymentMethodService.save(customerId, card('pm_x', '9999'));
    await createCustomer({ email: 'bob@example.com' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@example.com', password: 'SecurePass@123' });
    const bob = `Bearer ${login.body.accessToken}`;

    const res = await request(app)
      .delete(`/api/v1/users/me/payment-methods/${theirs.id}`)
      .set('Authorization', bob);
    const list = await request(app)
      .get('/api/v1/users/me/payment-methods')
      .set('Authorization', bob);

    expect(res.status).toBe(404);
    expect(list.body.data).toEqual([]);
    expect((await request(app).get('/api/v1/users/me/payment-methods')).status).toBe(401);
  });
});
