jest.mock('../../../src/models', () => ({
  Cart: { findOrCreate: jest.fn(), findOne: jest.fn() },
  CartItem: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  ProductVariant: { findByPk: jest.fn() },
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn(),
      rollback: jest.fn(),
      LOCK: { UPDATE: 'UPDATE' },
    }),
  },
}));

const { Cart, CartItem, ProductVariant } = require('../../../src/models');
const cartService = require('../../../src/services/cart.service');

const OWNER = { sessionToken: 'guest_abcdef1234567890' };

describe('cartService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Cart.findOrCreate.mockResolvedValue([{ id: 1 }, true]);
  });

  describe('addItem', () => {
    it('should create a new line given the SKU is not in the cart', async () => {
      ProductVariant.findByPk.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 0 });
      CartItem.findOne.mockResolvedValue(null);
      CartItem.create.mockResolvedValue({ id: 5, quantity: 2 });

      const item = await cartService.addItem(OWNER, 7, 2);

      expect(CartItem.create).toHaveBeenCalledWith(
        { cartId: 1, productVariantId: 7, quantity: 2 },
        expect.any(Object)
      );
      expect(item.id).toBe(5);
    });

    it('should add to the existing line given the SKU is already in the cart', async () => {
      const existing = { quantity: 1, save: jest.fn().mockResolvedValue({ quantity: 3 }) };
      ProductVariant.findByPk.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 0 });
      CartItem.findOne.mockResolvedValue(existing);

      await cartService.addItem(OWNER, 7, 2);

      expect(existing.quantity).toBe(3);
      expect(existing.save).toHaveBeenCalled();
    });

    it('should throw not found given an unknown variant', async () => {
      ProductVariant.findByPk.mockResolvedValue(null);

      await expect(cartService.addItem(OWNER, 99, 1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should throw conflict given quantity above available stock', async () => {
      ProductVariant.findByPk.mockResolvedValue({ stockQuantity: 5, reservedQuantity: 4 });
      CartItem.findOne.mockResolvedValue(null);

      await expect(cartService.addItem(OWNER, 7, 3)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('getCart', () => {
    it('should return an empty list given no cart exists', async () => {
      Cart.findOne.mockResolvedValue(null);

      expect(await cartService.getCart(OWNER)).toEqual([]);
    });

    it('should return the items given a cart exists', async () => {
      Cart.findOne.mockResolvedValue({ id: 1 });
      CartItem.findAll.mockResolvedValue([{ id: 1 }]);

      expect(await cartService.getCart(OWNER)).toHaveLength(1);
    });
  });

  describe('updateItem', () => {
    it('should throw not found given the item is not in the owner cart', async () => {
      Cart.findOne.mockResolvedValue({ id: 1 });
      CartItem.findOne.mockResolvedValue(null);

      await expect(cartService.updateItem(OWNER, 3, 2)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should throw conflict given quantity above stock', async () => {
      Cart.findOne.mockResolvedValue({ id: 1 });
      CartItem.findOne.mockResolvedValue({ productVariantId: 7, save: jest.fn() });
      ProductVariant.findByPk.mockResolvedValue({ stockQuantity: 2, reservedQuantity: 0 });

      await expect(cartService.updateItem(OWNER, 3, 5)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('should save the new quantity given enough stock', async () => {
      const item = { productVariantId: 7, quantity: 1, save: jest.fn().mockResolvedValue({}) };
      Cart.findOne.mockResolvedValue({ id: 1 });
      CartItem.findOne.mockResolvedValue(item);
      ProductVariant.findByPk.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 0 });

      await cartService.updateItem(OWNER, 3, 4);

      expect(item.quantity).toBe(4);
      expect(item.save).toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('should destroy the item given the owner holds it', async () => {
      const item = { destroy: jest.fn() };
      Cart.findOne.mockResolvedValue({ id: 1 });
      CartItem.findOne.mockResolvedValue(item);

      expect(await cartService.removeItem(OWNER, 3)).toBe(true);
      expect(item.destroy).toHaveBeenCalled();
    });

    it('should throw not found given no cart exists', async () => {
      Cart.findOne.mockResolvedValue(null);

      await expect(cartService.removeItem(OWNER, 3)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
