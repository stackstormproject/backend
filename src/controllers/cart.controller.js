const cartService = require('../services/cart.service');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

const MAX_QTY = 99;
const isId = (v) => Number.isInteger(v) && v > 0;
const validQty = (q) => Number.isInteger(q) && q >= 1 && q <= MAX_QTY;

const getCart = async (req, res, next) => {
  try {
    const items = await cartService.getCart(req.cartOwner);
    return successResponse(res, { items }, 'Cart retrieved');
  } catch (err) {
    return next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const { variant_id: variantId, quantity } = req.body;
    if (!isId(variantId) || !validQty(quantity)) {
      return errorResponse(res, 'variant_id must be a positive integer and quantity an integer 1-99', [], 400);
    }
    const item = await cartService.addItem(req.cartOwner, variantId, quantity);
    return successResponse(res, { item }, 'Item added to cart', 201);
  } catch (err) {
    return next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const itemId = Number(req.params.id);
    const { quantity } = req.body;
    if (!isId(itemId) || !validQty(quantity)) {
      return errorResponse(res, 'Invalid item id or quantity (integer 1-99)', [], 400);
    }
    const item = await cartService.updateItem(req.cartOwner, itemId, quantity);
    return successResponse(res, { item }, 'Cart item updated');
  } catch (err) {
    return next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const itemId = Number(req.params.id);
    if (!isId(itemId)) return errorResponse(res, 'Invalid item id', [], 400);
    await cartService.removeItem(req.cartOwner, itemId);
    return successResponse(res, { removed: true }, 'Item removed from cart');
  } catch (err) {
    return next(err);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem };