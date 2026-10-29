const request = require('supertest');
const app = require('../../src/app');
const { Brand, sequelize } = require('../../src/models');
const { createAdmin } = require('../helpers/db');
const { generateAccessToken } = require('../../src/utils/tokenGenerator');

// Refs #188 (FR-001, FR-002): search-as-you-type and colour filter options.
describe('search suggestions and facets', () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const word = `Zq${stamp}`;
  let bearer;

  beforeAll(async () => {
    const admin = await createAdmin({ email: `search.${stamp}@example.com`, role: 'admin' });
    bearer = `Bearer ${generateAccessToken(admin.id, 'admin')}`;
    const api = (body) =>
      request(app).post('/api/v1/admin/products').set('Authorization', bearer).send(body);
    await Brand.create({ name: `${word} Looms`, slug: `${word.toLowerCase()}-looms` });
    await api({
      name: `Linen ${word} Shirt`,
      price: 3000,
      brand: `${word} Looms`,
      variants: [{ size: 'M', color: `Saffron${stamp}`, stock_quantity: 3 }],
    });
    await api({
      name: `${word} Batik Sarong`,
      price: 2500,
      variants: [{ size: 'L', color: `Saffron${stamp}`, stock_quantity: 2 }],
    });
    await api({
      name: `Plain Shawl ${stamp}`,
      description: `Soft wool, made by ${word} weavers`,
      price: 2000,
      variants: [{ size: 'One Size', color: `Ash${stamp}`, stock_quantity: 0 }],
    });
  });

  afterAll(async () => {
    await sequelize.query(`UPDATE products SET is_active = false WHERE name LIKE :p`, {
      replacements: { p: `%${stamp}%` },
    });
    await Brand.destroy({ where: { name: `${word} Looms` } });
    await sequelize.close();
  });

  it('should rank names starting with the text first, then other matches', async () => {
    const res = await request(app).get(`/api/v1/products/suggest?q=${word.toLowerCase()}`);

    expect(res.status).toBe(200);
    const names = res.body.data.products.map((p) => p.name);
    expect(names).toEqual([`${word} Batik Sarong`, `Linen ${word} Shirt`, `Plain Shawl ${stamp}`]);
    expect(res.body.data.products[0]).toMatchObject({ price: 2500, slug: expect.any(String) });
    expect(res.body.data.brands).toEqual([
      { name: `${word} Looms`, slug: `${word.toLowerCase()}-looms` },
    ]);
  });

  it('should return nothing for one letter and treat % literally', async () => {
    const short = await request(app).get('/api/v1/products/suggest?q=z');
    expect(short.body.data).toEqual({ query: 'z', products: [], categories: [], brands: [] });

    const wildcard = await request(app).get(`/api/v1/products/suggest?q=${word}%25zz`);
    expect(wildcard.body.data.products).toEqual([]);
  });

  it('should find products by brand in the full search', async () => {
    const res = await request(app).get(`/api/v1/products?search=${word} Looms`);

    expect(res.body.data.products.map((p) => p.name)).toEqual([`Linen ${word} Shirt`]);
  });

  it('should list in-stock colours for the filter and filter by colour', async () => {
    const facets = await request(app).get('/api/v1/products/facets');

    expect(facets.status).toBe(200);
    expect(facets.body.data.colors).toContainEqual({ name: `Saffron${stamp}`, count: 2 });
    expect(facets.body.data.colors.map((c) => c.name)).not.toContain(`Ash${stamp}`);
    expect(facets.body.data.sizes).toEqual(expect.arrayContaining(['M', 'L']));

    const filtered = await request(app).get(`/api/v1/products?color=Saffron${stamp}`);
    expect(filtered.body.data.products).toHaveLength(2);
  });
});
