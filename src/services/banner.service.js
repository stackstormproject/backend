// ==============================================================================
// The shop's three home page hero banners (Sprint 13). Each banner has a fixed slot
// (1, 2 or 3); staff fill in an image, title, subtitle and an optional button that links
// anywhere in the shop. Only active banners with an image are shown to shoppers.
// ==============================================================================

const { Banner } = require('../models');
const ApiError = require('../utils/ApiError');

const TITLE_MAX = 120;
const SUBTITLE_MAX = 240;
const BUTTON_TEXT_MAX = 40;
const LINK_MAX = 300;
const SLOTS = [1, 2, 3];
const IMAGE_PATTERN = /^(https?:\/\/\S+|\/api\/v1\/media\/[\w./-]+)$/i;
// Internal paths only (no scheme) so a banner button cannot be used to send shoppers off-site.
const LINK_PATTERN = /^\/[\w\-./?=&%]*$/;

const text = (value, max) => {
  const clean = String(value ?? '').trim();
  return clean ? clean.slice(0, max) : null;
};

const toView = (banner) => ({
  id: banner.id,
  slot: banner.slot,
  title: banner.title,
  subtitle: banner.subtitle,
  image_url: banner.imageUrl,
  button_text: banner.buttonText,
  button_link: banner.buttonLink,
  is_active: banner.isActive,
});

/** Shop: the active banners, in slot order, each with an image. */
const listPublicBanners = async () => {
  const banners = await Banner.findAll({
    where: { isActive: true },
    order: [['slot', 'ASC']],
  });
  return banners.filter((b) => b.imageUrl).map(toView);
};

/** Admin: all three slots, filled or not, in slot order. */
const listBanners = async () => {
  const banners = await Banner.findAll({ order: [['slot', 'ASC']] });
  return banners.map(toView);
};

const bannerFields = (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.title !== undefined) {
    const title = text(body.title, TITLE_MAX);
    if (!title) throw ApiError.badRequest('Banner title is required');
    fields.title = title;
  }
  if (body.subtitle !== undefined) fields.subtitle = text(body.subtitle, SUBTITLE_MAX);
  if (!partial || body.image_url !== undefined) {
    const url = text(body.image_url, 500);
    if (!url || !IMAGE_PATTERN.test(url) || url.includes('..')) {
      throw ApiError.badRequest('Banner image must be an http(s) link or an uploaded image');
    }
    fields.imageUrl = url;
  }
  if (body.button_text !== undefined) fields.buttonText = text(body.button_text, BUTTON_TEXT_MAX);
  if (body.button_link !== undefined) {
    const link = text(body.button_link, LINK_MAX);
    if (link && !LINK_PATTERN.test(link)) {
      throw ApiError.badRequest('Button link must be a path within the shop, such as /sale');
    }
    fields.buttonLink = link;
  }
  if (body.is_active !== undefined) fields.isActive = Boolean(body.is_active);
  // A button needs somewhere to send the shopper, and a link with no label confuses one.
  const willHaveText = fields.buttonText !== undefined ? fields.buttonText : undefined;
  const willHaveLink = fields.buttonLink !== undefined ? fields.buttonLink : undefined;
  if ((willHaveText && !willHaveLink) || (willHaveLink && !willHaveText)) {
    throw ApiError.badRequest('A banner button needs both a label and a link');
  }
  return fields;
};

/** Creates or replaces the banner in a slot (1, 2 or 3); each slot holds exactly one banner. */
const upsertBanner = async (slot, body) => {
  const slotNum = Number(slot);
  if (!SLOTS.includes(slotNum)) {
    throw ApiError.badRequest(`Banner slot must be one of: ${SLOTS.join(', ')}`);
  }
  const existing = await Banner.findOne({ where: { slot: slotNum } });
  if (existing) {
    const fields = bannerFields(body, { partial: true });
    await existing.update(fields);
    return toView(existing);
  }
  const fields = bannerFields(body);
  const banner = await Banner.create({ ...fields, slot: slotNum });
  return toView(banner);
};

/** Clears a slot back to empty rather than deleting the row, so its slot number is kept. */
const clearBanner = async (slot) => {
  const banner = await Banner.findOne({ where: { slot: Number(slot) } });
  if (!banner) throw ApiError.notFound(`No banner in slot ${slot}`);
  await banner.destroy();
};

module.exports = {
  listPublicBanners,
  listBanners,
  upsertBanner,
  clearBanner,
  SLOTS,
};
