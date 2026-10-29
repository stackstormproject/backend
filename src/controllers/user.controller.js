const userService = require('../services/user.service');
const paymentMethodService = require('../services/paymentMethod.service');
const stripeService = require('../services/stripe.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');
const { uploadedFileUrl } = require('../utils/uploadedFileUrl');

const getCustomerId = (req) => {
  const customerId = req.user && (req.user.userId || req.user.id);
  if (!customerId) {
    throw ApiError.unauthorized('Authentication token is required');
  }
  return customerId;
};

/**
 * Retrieves authenticated customer profile, loyalty tier, and address book.
 * Route: GET /users/me, GET /users/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const profile = await userService.getProfile(customerId);
    return successResponse(res, profile, 'User profile retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates authenticated customer profile details.
 * Route: PUT /users/me, PUT /users/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const updated = await userService.updateProfile(customerId, req.body);
    return successResponse(res, updated, 'User profile updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves all saved shipping addresses for the authenticated customer.
 * Route: GET /users/addresses
 */
const getAddresses = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const addresses = await userService.getAddresses(customerId);
    return successResponse(res, addresses, 'Addresses retrieved successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Adds a new shipping address to the authenticated customer's address book.
 * Route: POST /users/addresses
 */
const addAddress = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const address = await userService.addAddress(customerId, req.body);
    return successResponse(res, address, 'Address added successfully', 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates an existing shipping address.
 * Route: PUT /users/addresses/:id
 */
const updateAddress = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const addressId = req.params.id;
    const address = await userService.updateAddress(customerId, addressId, req.body);
    return successResponse(res, address, 'Address updated successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Sets an address as default.
 * Route: PATCH /users/addresses/:id/default
 */
const setDefaultAddress = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const addressId = req.params.id;
    const address = await userService.setDefaultAddress(customerId, addressId);
    return successResponse(res, address, 'Default address set successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Deletes an address.
 * Route: DELETE /users/addresses/:id
 */
const deleteAddress = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    const addressId = req.params.id;
    const result = await userService.deleteAddress(customerId, addressId);
    return successResponse(res, result, 'Address deleted successfully', 200);
  } catch (error) {
    return next(error);
  }
};

feature/190-saved-payment-methods
/** GET /users/me/payment-methods: cards saved while paying (#190). */
const listPaymentMethods = async (req, res, next) => {
  try {
    const result = await paymentMethodService.list(getCustomerId(req));
    return successResponse(res, result, 'Saved cards retrieved', 200);

/** POST /users/me/avatar (multipart field "avatar"): new profile picture (#189). */
const uploadAvatar = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req);
    if (!req.file) {
      throw ApiError.badRequest('Choose a JPEG, PNG or WebP photo', undefined, 'NO_FILES_UPLOADED');
    }
    const result = await userService.setAvatar(customerId, uploadedFileUrl(req.file));
    return successResponse(res, result, 'Profile picture updated', 200);
 develop
  } catch (error) {
    return next(error);
  }
};

 feature/190-saved-payment-methods
/** PATCH /users/me/payment-methods/:id/default (#190). */
const setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const result = await paymentMethodService.setDefault(getCustomerId(req), req.params.id);
    return successResponse(res, result, 'Default card updated', 200);

/** DELETE /users/me/avatar (#189). */
const deleteAvatar = async (req, res, next) => {
  try {
    const result = await userService.removeAvatar(getCustomerId(req));
    return successResponse(res, result, 'Profile picture removed', 200);
 develop
  } catch (error) {
    return next(error);
  }
};

feature/190-saved-payment-methods
/** DELETE /users/me/payment-methods/:id: removes the card here and at Stripe (#190). */
const deletePaymentMethod = async (req, res, next) => {
  try {
    const result = await paymentMethodService.remove(
      getCustomerId(req),
      req.params.id,
      stripeService.detachPaymentMethod
    );
    return successResponse(res, result, 'Card removed', 200);

/** GET /users/me/preferences (#189). */
const getPreferences = async (req, res, next) => {
  try {
    const result = await userService.getPreferences(getCustomerId(req));
    return successResponse(res, result, 'Preferences retrieved', 200);
  } catch (error) {
    return next(error);
  }
};

/** PATCH /users/me/preferences with only the preferences to change (#189). */
const updatePreferences = async (req, res, next) => {
  try {
    const result = await userService.updatePreferences(getCustomerId(req), req.body);
    return successResponse(res, result, 'Preferences saved', 200);
 develop
  } catch (error) {
    return next(error);
  }
};

module.exports = {
feature/190-saved-payment-methods
  listPaymentMethods,
  setDefaultPaymentMethod,
  deletePaymentMethod,

  uploadAvatar,
  deleteAvatar,
  getPreferences,
  updatePreferences,
 develop
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
