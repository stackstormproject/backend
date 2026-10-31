const request = require('supertest');
const app = require('../../src/app');
const { resetDatabase, createCustomer, sequelize } = require('../helpers/db');

// Refs #189: profile picture and shopping preferences (FR-010).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

describe('profile picture and preferences', () => {
  let bearer;
  beforeEach(async () => {
    await resetDatabase();
    await createCustomer();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass@123' });
    bearer = `Bearer ${login.body.accessToken}`;
  });
  afterAll(() => sequelize.close());

  const api = (method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', bearer);

  it('should upload, show and remove a profile picture', async () => {
    const uploaded = await api('post', '/users/me/avatar').attach('avatar', PNG, {
      filename: 'me.png',
      contentType: 'image/png',
    });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.avatar_url).toMatch(/^https?:\/\/.+me\.png$/);

    const profile = await api('get', '/users/me');
    expect(profile.body.data.avatar_url).toBe(uploaded.body.data.avatar_url);

    const removed = await api('delete', '/users/me/avatar');
    expect(removed.body.data).toEqual({ avatar_url: null });
    expect((await api('get', '/users/me')).body.data.avatar_url).toBeNull();
  });

  // #3: the avatar survived a reload (GET /users/me) but vanished after signing out and back
  // in, because the login/register/refresh session customer only carried the Sequelize-shaped
  // `avatarUrl`, not the `avatar_url` the storefront actually reads.
  it('should still show a saved profile picture after signing out and back in', async () => {
    const uploaded = await api('post', '/users/me/avatar').attach('avatar', PNG, {
      filename: 'me.png',
      contentType: 'image/png',
    });
    expect(uploaded.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass@123' });
    expect(login.body.customer.avatar_url).toBe(uploaded.body.data.avatar_url);
  });

  it('should refuse a missing file, a non-image and a guest', async () => {
    expect((await api('post', '/users/me/avatar')).status).toBe(400);
    const text = await api('post', '/users/me/avatar').attach('avatar', Buffer.from('hi'), {
      filename: 'me.txt',
      contentType: 'text/plain',
    });
    expect(text.status).toBe(400);
    expect(text.body.error).toBe('INVALID_FILE_TYPE');
    expect((await request(app).delete('/api/v1/users/me/avatar')).status).toBe(401);
  });

  it('should save part of the preferences and return all of them', async () => {
    const initial = await api('get', '/users/me/preferences');
    expect(initial.body.data).toMatchObject({ newsletter: false, sale_alerts: true });

    const saved = await api('patch', '/users/me/preferences').send({
      newsletter: true,
      preferred_size: 'L',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      newsletter: true,
      preferred_size: 'L',
      sale_alerts: true,
    });

    const bad = await api('put', '/users/me/preferences').send({ preferred_payment: 'cheque' });
    expect(bad.status).toBe(400);
    expect(bad.body.details[0].field).toBe('preferred_payment');

    expect((await api('get', '/users/me')).body.data.preferences.newsletter).toBe(true);
  });
});
