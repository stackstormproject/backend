jest.mock('../../../src/models', () => ({
  Banner: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
}));

const { Banner } = require('../../../src/models');
const service = require('../../../src/services/banner.service');

// Sprint 13: hero banner admin management, mirroring brand.service's shape.
const banner = (overrides = {}) => ({
  id: 1,
  slot: 1,
  title: 'Batik Drop',
  subtitle: 'New season colours',
  imageUrl: 'https://cdn.example/banner1.jpg',
  buttonText: 'Shop now',
  buttonLink: '/sale',
  isActive: true,
  update: jest.fn(function update(fields) {
    Object.assign(this, fields);
  }),
  destroy: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bannerService.listPublicBanners', () => {
  it('should hide an active slot that has no image yet, in slot order', async () => {
    // isActive filtering happens in the DB query (asserted below); this covers the
    // in-memory imageUrl guard for a slot that was activated before an image was set.
    Banner.findAll.mockResolvedValue([banner(), banner({ id: 2, slot: 2, imageUrl: null })]);

    const result = await service.listPublicBanners();

    expect(result).toEqual([expect.objectContaining({ id: 1, slot: 1 })]);
    expect(Banner.findAll).toHaveBeenCalledWith({
      where: { isActive: true },
      order: [['slot', 'ASC']],
    });
  });
});

describe('bannerService.listBanners', () => {
  it('should list all three slots for staff regardless of active/image state', async () => {
    Banner.findAll.mockResolvedValue([banner(), banner({ id: 2, slot: 2, imageUrl: null })]);

    const result = await service.listBanners();

    expect(result).toHaveLength(2);
    expect(Banner.findAll).toHaveBeenCalledWith({ order: [['slot', 'ASC']] });
  });
});

describe('bannerService.upsertBanner', () => {
  it('should reject a slot outside 1-3', async () => {
    await expect(service.upsertBanner(4, { title: 'x' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('should reject a missing title on create', async () => {
    Banner.findOne.mockResolvedValue(null);

    await expect(
      service.upsertBanner(1, { image_url: 'https://cdn.example/a.jpg' })
    ).rejects.toMatchObject({ message: expect.stringMatching(/title/) });
  });

  it('should reject an image that is not an http(s) link or upload path', async () => {
    Banner.findOne.mockResolvedValue(null);

    await expect(
      service.upsertBanner(1, { title: 'Sale', image_url: '/etc/passwd' })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.upsertBanner(1, { title: 'Sale', image_url: '/api/v1/media/../x.png' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject a button link that leaves the shop', async () => {
    Banner.findOne.mockResolvedValue(null);

    await expect(
      service.upsertBanner(1, {
        title: 'Sale',
        image_url: 'https://cdn.example/a.jpg',
        button_text: 'Shop',
        button_link: 'https://elsewhere.example',
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/within the shop/) });
  });

  it('should reject a button label without a link and vice versa', async () => {
    Banner.findOne.mockResolvedValue(null);

    await expect(
      service.upsertBanner(1, {
        title: 'Sale',
        image_url: 'https://cdn.example/a.jpg',
        button_text: 'Shop now',
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/needs both/) });

    Banner.findOne.mockResolvedValue(null);
    await expect(
      service.upsertBanner(1, {
        title: 'Sale',
        image_url: 'https://cdn.example/a.jpg',
        button_link: '/sale',
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/needs both/) });
  });

  it('should create a new banner in an empty slot', async () => {
    Banner.findOne.mockResolvedValue(null);
    Banner.create = jest.fn().mockImplementation(async (fields) => banner({ id: 9, ...fields }));

    const result = await service.upsertBanner('2', {
      title: 'Season Sale',
      image_url: 'https://cdn.example/b.jpg',
      button_text: 'Browse sale',
      button_link: '/sale',
    });

    expect(Banner.create).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 2, title: 'Season Sale' })
    );
    expect(result).toMatchObject({ id: 9, slot: 2, button_text: 'Browse sale' });
  });

  it('should update an existing banner in place, partially', async () => {
    const existing = banner();
    Banner.findOne.mockResolvedValue(existing);

    const result = await service.upsertBanner(1, { title: 'Updated title' });

    expect(existing.update).toHaveBeenCalledWith({ title: 'Updated title' });
    expect(result.title).toBe('Updated title');
  });
});

describe('bannerService.clearBanner', () => {
  it('should destroy the banner row and 404 when the slot is empty', async () => {
    const existing = banner();
    Banner.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);

    await service.clearBanner(1);
    expect(existing.destroy).toHaveBeenCalled();

    await expect(service.clearBanner(1)).rejects.toMatchObject({ statusCode: 404 });
  });
});
