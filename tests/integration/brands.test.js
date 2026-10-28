const request = require('supertest');
const app = require('../../src/app');
const { Brand, Product, sequelize } = require('../../src/models');
const { createAdmin } = require('../helpers/db');
const { createTestCustomer } = require('../helpers/factories');
const { generateAccessToken } = require('../../src/utils/tokenGenerator');

// Refs #173: home page sections and "Our brands", managed by staff.
describe('Home sections and brands', () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let bearer;

  beforeAll(async () => {
    const admin = await createAdmin({ email: `brands.${stamp}@example.com`, role: 'admin' });
    bearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
  });

  afterAll(async () => {
    // Test products stay, like in the other suites; archive them so they leave the shop.
    await Product.update(
      { isActive: false },
      { where: { brand: [`Loom ${stamp}`, `Loom Works ${stamp}`] } }
    );
    await Brand.destroy({ where: { name: [`Loom ${stamp}`, `Loom Works ${stamp}`] } });
    await sequelize.close();
  });

  const api = (method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', bearer);
  const createProduct = (overrides) =>
    api('post', '/admin/products').send({
      name: `Section Shirt ${stamp} ${Math.random()}`,
      price: 3000,
      variants: [{ size: 'M', stock_quantity: 3 }],
      ...overrides,
    });

  it('should manage brands and show only featured brands with products in the shop', async () => {
    const created = await api('post', '/admin/brands').send({
      name: `Loom ${stamp}`,
      tagline: 'Woven by hand',
      logo_url: '/api/v1/media/products/logo.png',
      sort_order: 1,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ slug: `loom-${stamp}`, is_featured: true });

    const duplicate = await api('post', '/admin/brands').send({ name: `Loom ${stamp}` });
    expect(duplicate.status).toBe(409);
    expect((await api('post', '/admin/brands').send({ name: 'x' })).status).toBe(400);

    let shop = await request(app).get('/api/v1/brands');
    expect(shop.body.data.map((b) => b.name)).not.toContain(`Loom ${stamp}`);

    await createProduct({ brand: `Loom ${stamp}` });
    shop = await request(app).get('/api/v1/brands');
    expect(shop.body.data.find((b) => b.name === `Loom ${stamp}`)).toMatchObject({
      product_count: 1,
      tagline: 'Woven by hand',
    });

    const renamed = await api('put', `/admin/brands/${created.body.data.id}`).send({
      name: `Loom Works ${stamp}`,
    });
    expect(renamed.body.data).toMatchObject({ product_count: 1, slug: `loom-works-${stamp}` });
    const bySlug = await request(app).get(`/api/v1/products?brand=loom-works-${stamp}`);
    expect(bySlug.body.data.products).toHaveLength(1);
    expect(bySlug.body.data.products[0].brand).toBe(`Loom Works ${stamp}`);

    await api('put', `/admin/brands/${created.body.data.id}`).send({ is_featured: false });
    shop = await request(app).get('/api/v1/brands');
    expect(shop.body.data.map((b) => b.id)).not.toContain(created.body.data.id);

    const all = await api('get', '/admin/brands');
    expect(all.body.data.map((b) => b.id)).toContain(created.body.data.id);

    expect((await api('delete', `/admin/brands/${created.body.data.id}`)).status).toBe(200);
    expect((await api('delete', `/admin/brands/${created.body.data.id}`)).status).toBe(404);
    expect((await api('put', '/admin/brands/999999').send({ tagline: 'x' })).status).toBe(404);
  });

  it('should list products in the sections staff chose', async () => {
    const fresh = await createProduct({ is_new_arrival: true, brand: `Loom ${stamp}` });
    const popular = await createProduct({ is_popular: true, brand: `Loom ${stamp}` });
    expect(fresh.body.data).toMatchObject({ is_new_arrival: true, is_popular: false });

    const newIn = await request(app).get(
      `/api/v1/products?section=new_arrivals&brand=Loom ${stamp}`
    );
    expect(newIn.body.data.products.map((p) => p.id)).toEqual([fresh.body.data.id]);
    const hot = await request(app).get(`/api/v1/products?section=popular&brand=Loom ${stamp}`);
    expect(hot.body.data.products.map((p) => p.id)).toEqual([popular.body.data.id]);

    const managed = await api('get', '/admin/products?section=popular&limit=100');
    expect(managed.body.data.products.map((p) => p.id)).toContain(popular.body.data.id);
    expect(managed.body.data.products.map((p) => p.id)).not.toContain(fresh.body.data.id);

    await api('put', `/admin/products/${fresh.body.data.id}`).send({ is_new_arrival: false });
    const after = await request(app).get(
      `/api/v1/products?section=new_arrivals&brand=Loom ${stamp}`
    );
    expect(after.body.data.products).toHaveLength(0);
  });

  it('should keep brand management to managers', async () => {
    const customer = await createTestCustomer();
    const res = await request(app)
      .get('/api/v1/admin/brands')
      .set('Authorization', `Bearer ${generateAccessToken(customer.id, 'customer')}`);
    expect(res.status).toBe(403);
  });
});
