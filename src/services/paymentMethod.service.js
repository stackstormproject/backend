// ==============================================================================
// Saved payment methods (#190, FR-010). A card is saved only when the customer ticks
// "save" on the payment page. Stripe keeps the card; we keep brand, last four digits
// and expiry to show it, plus Stripe's id to remove it. The test gateway saves a
// labelled test card the same way so the feature works without a Stripe account.
// ==============================================================================

const { PaymentMethod, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const TEST_PROVIDER = 'test';
const STRIPE_PROVIDER = 'stripe';

const toView = (pm) => ({
  id: pm.id,
  provider: pm.provider,
  brand: pm.brand,
  last4: pm.last4,
  exp_month: pm.expMonth,
  exp_year: pm.expYear,
  is_default: pm.isDefault,
  is_test: pm.provider === TEST_PROVIDER,
  created_at: pm.createdAt,
});

const ORDER = [
  ['isDefault', 'DESC'],
  ['createdAt', 'DESC'],
];

const list = async (customerId) =>
  (await PaymentMethod.findAll({ where: { customerId }, order: ORDER })).map(toView);

/**
 * Adds a card, or refreshes it if it is already saved. The first card becomes the default.
 * @param {{ provider, providerRef, brand, last4, expMonth, expYear }} card
 */
const save = async (customerId, card) =>
  sequelize.transaction(async (transaction) => {
    const existing = await PaymentMethod.findOne({
      where: { customerId, providerRef: card.providerRef },
      transaction,
    });
    if (existing) {
      await existing.update(card, { transaction });
      return toView(existing);
    }
    const count = await PaymentMethod.count({ where: { customerId }, transaction });
    const created = await PaymentMethod.create(
      { ...card, customerId, isDefault: count === 0 },
      { transaction }
    );
    return toView(created);
  });

/** Saves the card a Stripe payment used, from the expanded PaymentMethod object. */
const saveFromStripe = async (customerId, stripePaymentMethod) => {
  const card = stripePaymentMethod?.card;
  if (!card) return null;
  return save(customerId, {
    provider: STRIPE_PROVIDER,
    providerRef: stripePaymentMethod.id,
    brand: card.brand || 'card',
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  });
};

/** The test gateway's card (Visa ending 4242), saved when the shopper ticks "save". */
const saveTestCard = (customerId) =>
  save(customerId, {
    provider: TEST_PROVIDER,
    providerRef: 'test_card_4242',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: new Date().getFullYear() + 3,
  });

const findOwned = async (customerId, id, transaction) => {
  const pm = await PaymentMethod.findOne({ where: { id, customerId }, transaction });
  if (!pm) throw ApiError.notFound('Saved card not found');
  return pm;
};

/** Makes one card the default for this customer. */
const setDefault = async (customerId, id) => {
  await sequelize.transaction(async (transaction) => {
    const pm = await findOwned(customerId, id, transaction);
    await PaymentMethod.update({ isDefault: false }, { where: { customerId }, transaction });
    await pm.update({ isDefault: true }, { transaction });
  });
  return list(customerId);
};

/**
 * Removes a card here and detaches it at Stripe. If it was the default, the newest other
 * card takes over.
 * @param {(ref: string) => Promise<void>} detach removes the card at the provider
 */
const remove = async (customerId, id, detach) => {
  const pm = await findOwned(customerId, id);
  if (pm.provider === STRIPE_PROVIDER && detach) {
    try {
      await detach(pm.providerRef);
    } catch (error) {
      // Already detached at Stripe is fine; anything else is reported but the card still goes.
      logger.warn('Could not detach card at Stripe', { id: pm.id, error: error.message });
    }
  }
  await sequelize.transaction(async (transaction) => {
    await pm.destroy({ transaction });
    if (pm.isDefault) {
      const next = await PaymentMethod.findOne({
        where: { customerId },
        order: [['createdAt', 'DESC']],
        transaction,
      });
      if (next) await next.update({ isDefault: true }, { transaction });
    }
  });
  return list(customerId);
};

module.exports = { list, save, saveFromStripe, saveTestCard, setDefault, remove, toView };
