const userService = require('../services/user.service');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

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

module.exports = {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
