// ==============================================================================
// Shopping preferences (#189, FR-010). Stored as JSON on the customer; anything not
// saved yet takes the default, so new options can be added without a migration.
// ==============================================================================

const ApiError = require('../utils/ApiError');

const PAYMENT_CHOICES = ['card', 'cod'];
const SIZE_MAX = 20;

const DEFAULTS = Object.freeze({
  order_updates_email: true, // emails when an order changes status (FR-020)
  sale_alerts: true, // wishlist items go on sale (FR-005)
  back_in_stock_alerts: true, // wishlist items come back in stock (FR-005)
  newsletter: false, // marketing campaigns, opt-in only (FR-024)
  push_notifications: false, // browser notifications (FR-032)
  preferred_payment: 'card',
  preferred_size: null,
});

const BOOLEAN_KEYS = Object.keys(DEFAULTS).filter((key) => typeof DEFAULTS[key] === 'boolean');

/** Saved preferences on top of the defaults, ignoring keys that are no longer used. */
const withDefaults = (saved) => {
  const result = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((key) => {
    if (saved && saved[key] !== undefined) result[key] = saved[key];
  });
  return result;
};

/**
 * Checks a partial update and returns the cleaned changes.
 * @throws {ApiError} 400 VALIDATION_ERROR listing each problem
 */
const validateChanges = (changes) => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw ApiError.badRequest('Send the preferences as an object');
  }
  const errors = [];
  const clean = {};
  Object.entries(changes).forEach(([key, value]) => {
    if (!(key in DEFAULTS)) {
      errors.push({ field: key, message: 'Unknown preference' });
    } else if (BOOLEAN_KEYS.includes(key)) {
      if (typeof value === 'boolean') clean[key] = value;
      else errors.push({ field: key, message: 'Must be true or false' });
    } else if (key === 'preferred_payment') {
      if (PAYMENT_CHOICES.includes(value)) clean[key] = value;
      else errors.push({ field: key, message: `Must be one of: ${PAYMENT_CHOICES.join(', ')}` });
    } else if (value === null || value === '') {
      clean[key] = null;
    } else if (typeof value === 'string' && value.trim().length <= SIZE_MAX) {
      clean[key] = value.trim();
    } else {
      errors.push({ field: key, message: `Must be a size of up to ${SIZE_MAX} characters` });
    }
  });
  if (errors.length)
    throw ApiError.badRequest('Some preferences are not valid', errors, 'VALIDATION_ERROR');
  return clean;
};

/** Saves part of the preferences and returns all of them. */
const updatePreferences = async (customer, changes) => {
  const clean = validateChanges(changes);
  const next = { ...withDefaults(customer.preferences), ...clean };
  await customer.update({ preferences: next });
  return next;
};

/** Whether a customer wants a kind of message, e.g. wants(customer, 'sale_alerts'). */
const wants = (customer, key) => Boolean(withDefaults(customer?.preferences)[key]);

module.exports = { DEFAULTS, withDefaults, validateChanges, updatePreferences, wants };
