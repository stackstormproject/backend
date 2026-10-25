const { Customer, Address, Loyalty, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Validates international E.164 or common domestic phone formats.
 *
 * @param {string} phone
 * @returns {boolean}
 */
const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.trim();
  return /^\+?[0-9\s\-()]{7,20}$/.test(cleaned);
};

/**
 * Formats an Address model instance into a clean DTO supporting both snake_case and camelCase.
 *
 * @param {object} address
 * @returns {object}
 */
const formatAddress = (address) => {
  if (!address) return null;
  const raw = typeof address.toJSON === 'function' ? address.toJSON() : address;
  const line1 = raw.addressLine1 || raw.address_line1 || '';
  const line2 = raw.addressLine2 || raw.address_line2 || null;
  const postal = raw.postalCode || raw.postal_code || '';
  const isDef = Boolean(raw.isDefault ?? raw.is_default);

  return {
    id: raw.id,
    customer_id: raw.customerId || raw.customer_id,
    customerId: raw.customerId || raw.customer_id,
    address_line1: line1,
    addressLine1: line1,
    address_line2: line2,
    addressLine2: line2,
    city: raw.city,
    state: raw.state || null,
    postal_code: postal,
    postalCode: postal,
    country: raw.country || 'Sri Lanka',
    is_default: isDef,
    isDefault: isDef,
    created_at: raw.createdAt || raw.created_at,
    updated_at: raw.updatedAt || raw.updated_at,
  };
};

/**
 * Retrieves the comprehensive profile of an authenticated customer,
 * including contact info, loyalty tier/points, and address book.
 *
 * @param {number|string} customerId
 * @returns {Promise<object>}
 */
const getProfile = async (customerId) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const customer = await Customer.findByPk(customerId, {
    include: [
      {
        model: Address,
        as: 'addresses',
      },
      {
        model: Loyalty,
        as: 'loyalty',
      },
    ],
    order: [
      [{ model: Address, as: 'addresses' }, 'is_default', 'DESC'],
      [{ model: Address, as: 'addresses' }, 'created_at', 'DESC'],
    ],
  });

  if (!customer) {
    throw ApiError.notFound('Customer profile not found');
  }

  const addresses = (customer.addresses || []).map(formatAddress);
  const tier = customer.loyalty?.tier || customer.loyaltyTier || 'silver';
  const points = customer.loyalty?.currentPoints ?? customer.loyaltyPoints ?? 0;

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || null,
    phone_number: customer.phone || null,
    loyalty_tier: tier,
    loyaltyTier: tier,
    loyalty_points: points,
    loyaltyPoints: points,
    addresses,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
};

/**
 * Updates profile properties (name, phone number) for an authenticated customer.
 *
 * @param {number|string} customerId
 * @param {object} payload
 * @returns {Promise<object>}
 */
const updateProfile = async (customerId, payload = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }

  const phone = payload.phone !== undefined ? payload.phone : payload.phone_number;
  const { name } = payload;

  if (phone !== undefined && phone !== null && phone !== '') {
    if (!isValidPhone(phone)) {
      throw ApiError.badRequest('Invalid phone number format');
    }
  }

  const updates = {};
  if (name !== undefined && typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }
  if (phone !== undefined) {
    updates.phone = phone ? phone.trim() : null;
  }

  if (Object.keys(updates).length > 0) {
    await customer.update(updates);
  }

  return getProfile(customerId);
};

/**
 * Retrieves all shipping addresses for an authenticated customer.
 *
 * @param {number|string} customerId
 * @returns {Promise<Array<object>>}
 */
const getAddresses = async (customerId) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const addresses = await Address.findAll({
    where: { customerId },
    order: [
      ['is_default', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });

  return addresses.map(formatAddress);
};

/**
 * Adds a new shipping address to the customer's address book.
 * If is_default is true (or if this is the first address), sets is_default to true.
 *
 * @param {number|string} customerId
 * @param {object} addressData
 * @returns {Promise<object>}
 */
const addAddress = async (customerId, addressData = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }

  const line1 = (addressData.address_line1 || addressData.addressLine1 || '').trim();
  const line2 = (addressData.address_line2 || addressData.addressLine2 || '').trim() || null;
  const city = (addressData.city || '').trim();
  const state = (addressData.state || '').trim() || null;
  const postalCode = (addressData.postal_code || addressData.postalCode || '').trim();
  const country = (addressData.country || 'Sri Lanka').trim();
  const isDefaultInput =
    addressData.is_default !== undefined ? addressData.is_default : addressData.isDefault;

  if (!line1) {
    throw ApiError.badRequest('Address line 1 is required and cannot be empty');
  }
  if (!city) {
    throw ApiError.badRequest('City is required and cannot be empty');
  }
  if (!postalCode) {
    throw ApiError.badRequest('Postal code is required and cannot be empty');
  }

  const existingCount = await Address.count({ where: { customerId } });
  const shouldBeDefault = Boolean(isDefaultInput) || existingCount === 0;

  let createdAddress;
  if (sequelize && typeof sequelize.transaction === 'function') {
    await sequelize.transaction(async (t) => {
      if (shouldBeDefault) {
        await Address.update({ isDefault: false }, { where: { customerId }, transaction: t });
      }

      createdAddress = await Address.create(
        {
          customerId,
          addressLine1: line1,
          addressLine2: line2,
          city,
          state,
          postalCode,
          country,
          isDefault: shouldBeDefault,
        },
        { transaction: t }
      );
    });
  } else {
    if (shouldBeDefault) {
      await Address.update({ isDefault: false }, { where: { customerId } });
    }
    createdAddress = await Address.create({
      customerId,
      addressLine1: line1,
      addressLine2: line2,
      city,
      state,
      postalCode,
      country,
      isDefault: shouldBeDefault,
    });
  }

  return formatAddress(createdAddress);
};

/**
 * Updates an existing address for the authenticated customer.
 * Enforces ownership boundary to prevent IDOR attacks.
 *
 * @param {number|string} customerId
 * @param {number|string} addressId
 * @param {object} updateData
 * @returns {Promise<object>}
 */
const updateAddress = async (customerId, addressId, updateData = {}) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }
  if (!addressId) {
    throw ApiError.badRequest('Address ID is required');
  }

  const address = await Address.findByPk(addressId);
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  if (Number(address.customerId) !== Number(customerId)) {
    throw ApiError.forbidden('Address does not belong to customer');
  }

  const line1 = updateData.address_line1 || updateData.addressLine1;
  const line2 = updateData.address_line2 || updateData.addressLine2;
  const { city, state, country } = updateData;
  const postalCode = updateData.postal_code || updateData.postalCode;
  const isDefaultInput =
    updateData.is_default !== undefined ? updateData.is_default : updateData.isDefault;

  const updates = {};
  if (line1 !== undefined) updates.addressLine1 = line1.trim();
  if (line2 !== undefined) updates.addressLine2 = line2 ? line2.trim() : null;
  if (city !== undefined) updates.city = city.trim();
  if (state !== undefined) updates.state = state ? state.trim() : null;
  if (postalCode !== undefined) updates.postalCode = postalCode.trim();
  if (country !== undefined) updates.country = country.trim();
  if (isDefaultInput !== undefined) updates.isDefault = Boolean(isDefaultInput);

  let updatedAddress;
  if (sequelize && typeof sequelize.transaction === 'function') {
    await sequelize.transaction(async (t) => {
      if (updates.isDefault === true) {
        await Address.update({ isDefault: false }, { where: { customerId }, transaction: t });
      }
      updatedAddress = await address.update(updates, { transaction: t });
    });
  } else {
    if (updates.isDefault === true) {
      await Address.update({ isDefault: false }, { where: { customerId } });
    }
    updatedAddress = await address.update(updates);
  }

  return formatAddress(updatedAddress);
};

/**
 * Sets an address as the default shipping address.
 *
 * @param {number|string} customerId
 * @param {number|string} addressId
 * @returns {Promise<object>}
 */
const setDefaultAddress = async (customerId, addressId) =>
  updateAddress(customerId, addressId, { isDefault: true });

/**
 * Deletes a shipping address belonging to the customer.
 * Enforces ownership check ensuring users cannot delete addresses belonging to others.
 *
 * @param {number|string} customerId
 * @param {number|string} addressId
 * @returns {Promise<object>}
 */
const deleteAddress = async (customerId, addressId) => {
  if (!customerId) {
    throw ApiError.unauthorized('Customer identity is required');
  }
  if (!addressId) {
    throw ApiError.badRequest('Address ID is required');
  }

  const address = await Address.findByPk(addressId);
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  if (Number(address.customerId) !== Number(customerId)) {
    throw ApiError.forbidden('Address does not belong to customer');
  }

  const wasDefault = address.isDefault;
  await address.destroy();

  if (wasDefault) {
    const remainingAddress = await Address.findOne({
      where: { customerId },
      order: [['created_at', 'DESC']],
    });
    if (remainingAddress) {
      await remainingAddress.update({ isDefault: true });
    }
  }

  return { deleted: true, id: addressId };
};

module.exports = {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  isValidPhone,
  formatAddress,
};
