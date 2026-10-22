const { UniqueConstraintError } = require('sequelize');
const { Cart, CartItem, ProductVariant, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');

const availableOf = (v) => Math.max(0, (v.stockQuantity ?? 0) - (v.reservedQuantity ?? 0));

/** One cart per owner. Falls back to a read if two requests race to create it. */
const getOrCreateCart = async (owner, transaction) => {
  try {
    const [cart] = await Cart.findOrCreate({ where: owner, defaults: owner, transaction });
    return cart;
  } catch (err) {
    if (err instanceof UniqueConstraintError) return Cart.findOne({ where: owner, transaction });
    throw err;
  }
};

const getCart = async (owner) => {
  const cart = await Cart.findOne({ where: owner });
  if (!cart) return [];
  return CartItem.findAll({
    where: { cartId: cart.id },
    include: [{ model: ProductVariant }], // add `as: '<alias>'` if CartItem defines one
    order: [['id', 'ASC']],
  });
};

const addItem = async (owner, variantId, quantity, retry = true) => {
  const variant = await ProductVariant.findByPk(variantId);
  if (!variant) throw ApiError.notFound(`Variant ${variantId} not found`);

  const t = await sequelize.transaction();
  try {
    const cart = await getOrCreateCart(owner, t);
    const existing = await CartItem.findOne({
      where: { cartId: cart.id, productVariantId: variantId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const desired = (existing ? existing.quantity : 0) + quantity;
    const available = availableOf(variant);
    if (desired > available) {
      throw ApiError.conflict(`INSUFFICIENT_STOCK. Available: ${available}, Requested: ${desired}`);
    }

    let item;
    if (existing) {
      existing.quantity = desired;
      item = await existing.save({ transaction: t });
    } else {
      item = await CartItem.create(
        { cartId: cart.id, productVariantId: variantId, quantity },
        { transaction: t }
      );
    }
    await t.commit();
    return item;
  } catch (err) {
    await t.rollback();
    if (err instanceof UniqueConstraintError && retry) {
      return addItem(owner, variantId, quantity, false);
    }
    throw err;
  }
};

const findOwnedItem = async (owner, itemId) => {
  const cart = await Cart.findOne({ where: owner });
  if (!cart) return null;
  return CartItem.findOne({ where: { id: itemId, cartId: cart.id } }); // ownership enforced here
};

const updateItem = async (owner, itemId, quantity) => {
  const item = await findOwnedItem(owner, itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  const variant = await ProductVariant.findByPk(item.productVariantId);
  const available = variant ? availableOf(variant) : 0;
  if (quantity > available) {
    throw ApiError.conflict(`INSUFFICIENT_STOCK. Available: ${available}, Requested: ${quantity}`);
  }
  item.quantity = quantity;
  return item.save();
};

const removeItem = async (owner, itemId) => {
  const item = await findOwnedItem(owner, itemId);
  if (!item) throw ApiError.notFound('Cart item not found');
  await item.destroy();
  return true;
};

module.exports = { getCart, addItem, updateItem, removeItem };
