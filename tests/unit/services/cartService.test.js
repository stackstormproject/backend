jest.mock('../../../src/models', () => ({
  Cart: { findOrCreate: jest.fn(), findOne: jest.fn() },
  CartItem: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  ProductVariant: { findByPk: jest.fn() },
  Product: {},
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

    it('should return priced lines with product details given a cart exists', async () => {
      Cart.findOne.mockResolvedValue({ id: 1 });
      const row = {
        id: 4,
        productVariantId: 7,
        quantity: 2,
        variant: {
          sku: 'BAT-M',
          size: 'M',
          color: 'Blue',
          stockQuantity: 5,
          reservedQuantity: 1,
          additionalPrice: '250.00',
          product: { id: 3, name: 'Batik Shirt', slug: 'batik-shirt', price: '4500.00' },
        },
      };
      CartItem.findAll.mockResolvedValue([{ get: () => row }]);

      const [line] = await cartService.getCart(OWNER);

      expect(line).toMatchObject({
        id: 4,
        variant_id: 7,
        unit_price: 4750,
        line_total: 9500,
        available_stock: 4,
        product: { name: 'Batik Shirt', slug: 'batik-shirt' },
      });
    });

    it('should default missing variant data to safe values', () => {
      const line = cartService.toCartLine({ get: () => ({ id: 1, quantity: 1 }) });

      expect(line).toMatchObject({ unit_price: 0, available_stock: 0, product: { name: null } });
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

  describe('mergeGuestCart', () => {
    it('returns 0 merged items when guest cart does not exist', async () => {
      Cart.findOne.mockResolvedValueOnce(null);

      const result = await cartService.mergeGuestCart(4, 'guest_missing_token');
      expect(result).toEqual({ mergedCount: 0, clamped: [] });
    });

    it('merges guest items into customer cart, clamping and dropping zero stock items', async () => {
      const mockGuestCartDestroy = jest.fn().mockResolvedValue(true);
      const guestCart = { id: 2, destroy: mockGuestCartDestroy };
      Cart.findOne.mockResolvedValueOnce(guestCart);

      const mockExistingSave = jest.fn().mockResolvedValue({});
      const existingItem = {
        id: 50,
        cartId: 1,
        productVariantId: 10,
        quantity: 1,
        save: mockExistingSave,
      };

      const guestItem1 = {
        id: 101,
        cartId: 2,
        productVariantId: 10,
        quantity: 2,
        destroy: jest.fn().mockResolvedValue(true),
      };
      const guestItem2 = {
        id: 102,
        cartId: 2,
        productVariantId: 20,
        quantity: 3,
        save: jest.fn().mockResolvedValue(true),
      };
      const guestItem3 = {
        id: 103,
        cartId: 2,
        productVariantId: 30,
        quantity: 1,
        destroy: jest.fn().mockResolvedValue(true),
      };

      CartItem.findAll.mockResolvedValueOnce([guestItem1, guestItem2, guestItem3]);

      ProductVariant.findByPk.mockImplementation(async (id) => {
        if (id === 10) return { id: 10, stockQuantity: 5, reservedQuantity: 0 };
        if (id === 20) return { id: 20, stockQuantity: 2, reservedQuantity: 0 }; // clamp 3 -> 2
        if (id === 30) return { id: 30, stockQuantity: 0, reservedQuantity: 0 }; // out of stock
        return null;
      });

      CartItem.findOne.mockImplementation(async ({ where }) => {
        if (where.productVariantId === 10) return existingItem;
        return null;
      });

      const res = await cartService.mergeGuestCart(4, 'guest_valid_token');

      expect(res.mergedCount).toBe(3);
      expect(res.clamped).toEqual([
        { productVariantId: 20, requested: 3, applied: 2 },
        { productVariantId: 30, requested: 1, applied: 0 },
      ]);
      expect(existingItem.quantity).toBe(3);
      expect(mockExistingSave).toHaveBeenCalled();
      expect(guestItem1.destroy).toHaveBeenCalled();
      expect(guestItem2.cartId).toBe(1);
      expect(guestItem2.quantity).toBe(2);
      expect(guestItem2.save).toHaveBeenCalled();
      expect(guestItem3.destroy).toHaveBeenCalled();
      expect(mockGuestCartDestroy).toHaveBeenCalled();
    });

    it('rolls back transaction on database error during merge', async () => {
      Cart.findOne.mockRejectedValueOnce(new Error('DB failure'));

      await expect(cartService.mergeGuestCart(4, 'guest_token')).rejects.toThrow('DB failure');
    });
  });
});
