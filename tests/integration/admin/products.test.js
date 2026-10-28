const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../../src/app');
const { Product, sequelize } = require('../../../src/models');
const { createTestCustomer } = require('../../helpers/factories');
const { createAdmin } = require('../../helpers/db');
const { generateAccessToken } = require('../../../src/utils/tokenGenerator');

// Refs #136: catalogue management with variants, archiving and safe deletes.
describe('Admin product management', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let bearer;
  let admin;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    admin = await createAdmin({ email: `prod.${Date.now()}@example.com`, role: 'admin' });
    bearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
  });

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    await sequelize.close();
  });

  const api = (method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', bearer);
  const unique = () => `Test Batik ${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const create = (overrides = {}) =>
    api('post', '/admin/products').send({
      name: unique(),
      price: 4500,
      material: 'Cotton',
      variants: [
        { size: 'M', color: 'Indigo', stock_quantity: 5 },
        { size: 'XL', color: 'Indigo', additional_price: 250, stock_quantity: 2 },
      ],
      ...overrides,
    });

  it('should create a product with variants, SKUs and logged opening stock', async () => {
    const res = await create({ name: 'Signature Batik Shirt' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ price: 4500, is_active: true, total_available: 7 });
    expect(res.body.data.slug).toMatch(/^signature-batik-shirt/);
    expect(res.body.data.variants.map((v) => v.sku)).toEqual([
      `DFC-${res.body.data.id}-M-INDIGO`,
      `DFC-${res.body.data.id}-XL-INDIGO`,
    ]);
    const logs = await sequelize.query(
      'SELECT change_quantity, reason, admin_id FROM inventory_logs WHERE product_variant_id = :id',
      { replacements: { id: res.body.data.variants[0].id }, type: QueryTypes.SELECT }
    );
    expect(logs).toEqual([{ change_quantity: 5, reason: 'opening stock', admin_id: admin.id }]);
  });

  it('should save a main image and up to three extra images and show them in the shop (#172)', async () => {
    const extra = [
      '/api/v1/media/products/back.jpg',
      'https://cdn.example.com/detail.jpg',
      '/api/v1/media/products/worn.jpg',
    ];
    const res = await create({
      primary_image: '/api/v1/media/products/main.jpg',
      gallery_images: extra,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.gallery_images).toEqual(extra);
    const shop = await request(app).get(`/api/v1/products/${res.body.data.slug}`);
    expect(shop.body.data.images.map((img) => img.imageUrl)).toEqual([
      '/api/v1/media/products/main.jpg',
      ...extra,
    ]);

    const tooMany = await api('put', `/admin/products/${res.body.data.id}`).send({
      gallery_images: [...extra, 'https://cdn.example.com/four.jpg'],
    });
    expect(tooMany.status).toBe(400);
    const tricky = await api('put', `/admin/products/${res.body.data.id}`).send({
      gallery_images: ['/api/v1/media/../../etc/passwd'],
    });
    expect(tricky.status).toBe(400);
    const cleared = await api('put', `/admin/products/${res.body.data.id}`).send({
      gallery_images: [],
    });
    expect(cleared.body.data.gallery_images).toEqual([]);
  });

  it('should give a second product with the same name its own slug', async () => {
    const name = unique();
    const first = await create({ name });
    const second = await create({ name });

    expect(second.body.data.slug).toBe(`${first.body.data.slug}-2`);
  });

  it.each([
    [{ variants: [] }, /at least one size/],
    [{ price: 0 }, /Price must be/],
    [{ name: 'x' }, /Name must be/],
    [{ category_id: 999999 }, /Category 999999 does not exist/],
    [{ primary_image: 'javascript:alert(1)' }, /http\(s\) link or an uploaded image/],
    [{ variants: [{ size: 'M', stock_quantity: -1 }] }, /Opening stock/],
    [{ variants: [{ size: 'M' }, { size: 'M' }] }, /already has a M variant/],
  ])('should reject %j', async (overrides, message) => {
    const res = await create(overrides);

    expect([400, 409]).toContain(res.status);
    expect(res.body.message).toMatch(message);
  });

  it('should ignore fields that are not on the whitelist', async () => {
    const res = await create({ id: 1, slug: 'hijack', created_at: '2000-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(1);
    expect(res.body.data.slug).not.toBe('hijack');
  });

  it('should update fields, keep the slug and set the category name', async () => {
    const { body } = await create();
    const [category] = await sequelize.query(
      "SELECT id, name FROM categories WHERE slug = 'men-batik-shirts'",
      {
        type: QueryTypes.SELECT,
      }
    );

    const res = await api('put', `/admin/products/${body.data.id}`).send({
      name: 'Renamed Shirt',
      price: 4800,
      category_id: category?.id ?? null,
      is_final_sale: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Renamed Shirt',
      price: 4800,
      is_final_sale: true,
      slug: body.data.slug,
    });
    if (category) expect(res.body.data.category_name).toBe(category.name);
  });

  it('should hide an archived product from the shop and refuse it at checkout', async () => {
    const { body } = await create();
    await api('put', `/admin/products/${body.data.id}`).send({ is_active: false });

    const detail = await request(app).get(`/api/v1/products/${body.data.slug}`);
    const list = await request(app).get(
      `/api/v1/products?search=${encodeURIComponent(body.data.name)}`
    );
    const checkout = await request(app)
      .post('/api/v1/checkout/initiate')
      .send({
        guest_email: 'g@example.com',
        items: [{ variant_id: body.data.variants[0].id, quantity: 1 }],
        shippingAddress: { line1: '1 Road', city: 'Galle', postal_code: '80000' },
      });

    expect(detail.status).toBe(404);
    expect(list.body.data.products).toHaveLength(0);
    expect(checkout.status).toBe(409);
    expect(checkout.body.message).toMatch(/no longer sold/);
  });

  it('should list archived products for managers and filter by status', async () => {
    const { body } = await create();
    await api('put', `/admin/products/${body.data.id}`).send({ is_active: false });

    const archived = await api(
      'get',
      `/admin/products?status=archived&search=${encodeURIComponent(body.data.name)}`
    );
    const active = await api(
      'get',
      `/admin/products?status=active&search=${encodeURIComponent(body.data.name)}`
    );

    expect(archived.body.data.products.map((p) => p.id)).toEqual([body.data.id]);
    expect(active.body.data.products).toHaveLength(0);
  });

  it('should add, edit and delete an unused size', async () => {
    const { body } = await create();
    const id = body.data.id;

    const added = await api('post', `/admin/products/${id}/variants`).send({
      size: 'S',
      color: 'Indigo',
      stock_quantity: 3,
    });
    const newVariant = added.body.data.variants.find((v) => v.size === 'S');
    const edited = await api('patch', `/admin/products/${id}/variants/${newVariant.id}`).send({
      size: 'XS',
      additional_price: 100,
    });
    const removed = await api('delete', `/admin/products/${id}/variants/${newVariant.id}`);

    expect(added.status).toBe(201);
    expect(edited.body.data.variants.find((v) => v.id === newVariant.id)).toMatchObject({
      size: 'XS',
      additional_price: 100,
      sku: `DFC-${id}-XS-INDIGO`,
    });
    expect(removed.body.data.variants.map((v) => v.id)).not.toContain(newVariant.id);
  });

  it('should protect ordered variants and products with orders', async () => {
    const { body } = await create();
    const customer = await createTestCustomer();
    const variantId = body.data.variants[0].id;
    await request(app)
      .post('/api/v1/checkout/initiate')
      .set('Authorization', `Bearer ${generateAccessToken(customer.id, 'customer')}`)
      .send({
        items: [{ variant_id: variantId, quantity: 1 }],
        shippingAddress: { line1: '1 Road', city: 'Galle', postal_code: '80000' },
      });

    const detail = await api('get', `/admin/products/${body.data.id}`);
    const rename = await api('patch', `/admin/products/${body.data.id}/variants/${variantId}`).send(
      { size: 'L' }
    );
    const price = await api('patch', `/admin/products/${body.data.id}/variants/${variantId}`).send({
      additional_price: 50,
    });
    const deleteVariant = await api(
      'delete',
      `/admin/products/${body.data.id}/variants/${variantId}`
    );
    const deleteProduct = await api('delete', `/admin/products/${body.data.id}`);

    expect(detail.body.data.variants[0].in_use).toBe(true);
    expect(rename.status).toBe(409);
    expect(price.status).toBe(200);
    expect(deleteVariant.status).toBe(409);
    expect(deleteProduct.status).toBe(409);
    expect(deleteProduct.body.message).toMatch(/Archive it/);
  });

  it('should delete a product that was never ordered and refuse to remove the last size', async () => {
    const { body } = await create({ variants: [{ size: 'Free Size', stock_quantity: 1 }] });

    const lastSize = await api(
      'delete',
      `/admin/products/${body.data.id}/variants/${body.data.variants[0].id}`
    );
    const removed = await api('delete', `/admin/products/${body.data.id}`);

    expect(lastSize.status).toBe(409);
    expect(removed.status).toBe(200);
    expect(await Product.findByPk(body.data.id)).toBeNull();
  });

  it('should return 404s for unknown products and variants', async () => {
    expect((await api('get', '/admin/products/999999')).status).toBe(404);
    expect((await api('put', '/admin/products/999999').send({ price: 1 })).status).toBe(404);
    expect((await api('post', '/admin/products/999999/variants').send({ size: 'M' })).status).toBe(
      404
    );
    expect(
      (await api('patch', '/admin/products/999999/variants/1').send({ size: 'M' })).status
    ).toBe(404);
  });

  it('should no longer accept the old unguarded write routes and close admin routes to customers', async () => {
    const customer = await createTestCustomer();
    const asCustomer = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${generateAccessToken(customer.id, 'customer')}`)
      .send({ name: 'Nope', price: 1 });
    const oldRoute = await api('post', '/products').send({ name: 'Nope', price: 1 });

    expect(asCustomer.status).toBe(403);
    expect(oldRoute.status).toBe(404);
  });
});
