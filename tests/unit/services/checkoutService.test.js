const ApiError = require('../../../src/utils/ApiError');
const {
  validateShippingAddress,
  calculateShippingFee,
  generateOrderNumber,
  FREE_SHIPPING_THRESHOLD_LKR,
  STANDARD_SHIPPING_FEE_LKR,
} = require('../../../src/services/checkout.service');

describe('checkoutService', () => {
  describe('validateShippingAddress', () => {
    it('should throw bad request given null or invalid address', () => {
      expect(() => validateShippingAddress(null)).toThrow(ApiError);
      expect(() => validateShippingAddress('invalid string')).toThrow(ApiError);
    });

    it('should throw bad request given missing line1 / street address', () => {
      expect(() =>
        validateShippingAddress({
          city: 'Dickwella',
          postal_code: '81200',
        })
      ).toThrow(ApiError);
    });

    it('should throw bad request given missing city / town', () => {
      expect(() =>
        validateShippingAddress({
          line1: '123 Beach Road',
          postal_code: '81200',
        })
      ).toThrow(ApiError);
    });

    it('should throw bad request given invalid postal code (not 5 digits)', () => {
      expect(() =>
        validateShippingAddress({
          line1: '123 Beach Road',
          city: 'Dickwella',
          postal_code: '123',
        })
      ).toThrow(ApiError);

      expect(() =>
        validateShippingAddress({
          line1: '123 Beach Road',
          city: 'Dickwella',
          postal_code: 'ABCDE',
        })
      ).toThrow(ApiError);
    });

    it('should sanitize and return normalized address with valid 5-digit postal code', () => {
      const valid = {
        line1: ' 123 Beach Road ',
        line2: ' Apt 4B ',
        city: ' Dickwella ',
        district: ' Matara ',
        postal_code: '81200',
        country: ' Sri Lanka ',
      };

      const result = validateShippingAddress(valid);

      expect(result).toEqual({
        line1: '123 Beach Road',
        line2: 'Apt 4B',
        city: 'Dickwella',
        district: 'Matara',
        postal_code: '81200',
        country: 'Sri Lanka',
      });
    });

    it('should support alternative address field aliases (address_line1, street, postalCode, state)', () => {
      const aliasAddress = {
        address_line1: '45 Temple Road',
        address_line2: 'Suite 1',
        city: 'Colombo',
        state: 'Western',
        postalCode: '00100',
      };

      const result = validateShippingAddress(aliasAddress);

      expect(result.line1).toBe('45 Temple Road');
      expect(result.line2).toBe('Suite 1');
      expect(result.district).toBe('Western');
      expect(result.postal_code).toBe('00100');
      expect(result.country).toBe('Sri Lanka');
    });

    it('should default district to null if omitted and line2 to null if omitted', () => {
      const minimalAddress = {
        street: 'Main Street',
        city: 'Kandy',
        postalCode: '20000',
      };

      const result = validateShippingAddress(minimalAddress);

      expect(result.line2).toBeNull();
      expect(result.district).toBeNull();
    });
  });

  describe('calculateShippingFee', () => {
    it('should return 0.0 LKR for store pickup', () => {
      expect(calculateShippingFee(2500, 'pickup')).toBe(0.0);
      expect(calculateShippingFee(15000, 'pickup')).toBe(0.0);
    });

    it('should return 0.0 LKR for standard delivery above or equal to free shipping threshold (10,000 LKR)', () => {
      expect(calculateShippingFee(10000.0, 'standard')).toBe(0.0);
      expect(calculateShippingFee(12500.0, 'standard')).toBe(0.0);
      expect(calculateShippingFee(FREE_SHIPPING_THRESHOLD_LKR)).toBe(0.0);
    });

    it('should return flat 450.0 LKR for standard delivery under 10,000 LKR', () => {
      expect(calculateShippingFee(9999.0, 'standard')).toBe(STANDARD_SHIPPING_FEE_LKR);
      expect(calculateShippingFee(4500.0)).toBe(450.0);
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate an invoice identifier matching DFC-YYYYMMDD-XXXX format', () => {
      const orderNumber = generateOrderNumber();
      expect(orderNumber).toMatch(/^DFC-\d{8}-\d{4}$/);
    });

    it('should generate unique values across consecutive calls', () => {
      const num1 = generateOrderNumber();
      const num2 = generateOrderNumber();
      expect(typeof num1).toBe('string');
      expect(typeof num2).toBe('string');
    });
  });

  describe('initiateCheckout', () => {
    const { initiateCheckout } = require('../../../src/services/checkout.service');
    const { ProductVariant, Order, OrderItem, sequelize } = require('../../../src/models');
    const reservationService = require('../../../src/services/reservation.service');

    beforeEach(() => {
      jest.spyOn(sequelize, 'transaction').mockImplementation(async (fn) => fn({}));
      jest.spyOn(sequelize, 'query').mockResolvedValue([]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const stockedVariant = (overrides = {}) => ({
      id: 1,
      sku: 'BATIK-BLU-M',
      size: 'M',
      color: 'Blue',
      additionalPrice: '0.00',
      product: { id: 9, name: 'Batik Shirt', slug: 'batik-shirt', price: '3000.00' },
      ...overrides,
    });
    const validAddress = { line1: '123 Beach Road', city: 'Dickwella', postal_code: '81200' };

    it('should throw bad request for guest checkout without email', async () => {
      await expect(
        initiateCheckout({
          customerId: null,
          guestEmail: '',
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [{ variantId: 1, quantity: 2 }],
        })
      ).rejects.toThrow(ApiError);
    });

    it('should throw bad request for empty items list', async () => {
      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [],
        })
      ).rejects.toThrow(ApiError);
    });

    it('should throw bad request for guest checkout with invalid email format', async () => {
      await expect(
        initiateCheckout({
          customerId: null,
          guestEmail: 'invalid-email-address',
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [{ variantId: 1, quantity: 2 }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should throw bad request for invalid variant_id or quantity', async () => {
      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [{ variantId: 'invalid', quantity: 2 }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [{ variantId: 1, quantity: 0 }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should throw not found when variant does not exist in DB', async () => {
      jest.spyOn(ProductVariant, 'findAll').mockResolvedValue([]);
      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: {
            line1: '123 Beach Road',
            city: 'Dickwella',
            postal_code: '81200',
          },
          items: [{ variantId: 999, quantity: 1 }],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should initiate checkout, reserve stock, and persist order with billing address and standard shipping fee', async () => {
      jest.spyOn(ProductVariant, 'findAll').mockResolvedValue([stockedVariant()]);

      jest.spyOn(reservationService, 'reserveStock').mockResolvedValue({
        reservation_id: 'res_test_123',
        expires_in: 900,
      });

      jest.spyOn(Order, 'create').mockResolvedValue({
        id: 501,
        status: 'payment_pending',
        orderDate: new Date(),
        guestOrderToken: null,
      });

      jest.spyOn(OrderItem, 'bulkCreate').mockResolvedValue([]);

      const result = await initiateCheckout({
        customerId: 4,
        shippingAddress: {
          line1: '123 Beach Road',
          city: 'Dickwella',
          postal_code: '81200',
        },
        billingAddress: {
          line1: '45 Lake Road',
          city: 'Matara',
          postal_code: '81000',
        },
        items: [{ variantId: 1, quantity: 1 }],
        shippingMethod: 'standard',
      });

      expect(result.order_id).toBe(501);
      expect(result.breakdown.subtotal).toBe(3000.0);
      expect(result.breakdown.shipping_fee).toBe(450.0);
      expect(result.breakdown.total_amount).toBe(3450.0);
      expect(result.items[0].title).toBe('Batik Shirt');
      expect(OrderItem.bulkCreate).toHaveBeenCalledWith(
        [expect.objectContaining({ productVariantId: 1, unitPrice: 3000 })],
        expect.anything()
      );
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE stock_reservations'),
        expect.objectContaining({ replacements: { orderId: 501, id: 'res_test_123' } })
      );
    });

    it('should add the variant surcharge to the unit price given an XXL variant', async () => {
      jest
        .spyOn(ProductVariant, 'findAll')
        .mockResolvedValue([stockedVariant({ additionalPrice: '500.00' })]);
      jest.spyOn(reservationService, 'reserveStock').mockResolvedValue({ reservation_id: 'r1' });
      jest.spyOn(Order, 'create').mockResolvedValue({ id: 7, status: 'payment_pending' });
      jest.spyOn(OrderItem, 'bulkCreate').mockResolvedValue([]);

      const result = await initiateCheckout({
        customerId: 4,
        shippingAddress: validAddress,
        items: [{ variant_id: 1, quantity: 2 }],
      });

      expect(result.breakdown.subtotal).toBe(7000);
      expect(result.breakdown.shipping_fee).toBe(450);
    });

    it('should reject a variant whose product has no price', async () => {
      jest
        .spyOn(ProductVariant, 'findAll')
        .mockResolvedValue([stockedVariant({ product: { name: 'Broken', price: null } })]);

      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should reject an unknown shipping method', async () => {
      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
          shippingMethod: 'teleport',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should release the stock hold given the order insert fails', async () => {
      jest.spyOn(ProductVariant, 'findAll').mockResolvedValue([stockedVariant()]);
      jest.spyOn(reservationService, 'reserveStock').mockResolvedValue({ reservation_id: 'r9' });
      const release = jest.spyOn(reservationService, 'releaseReservation').mockResolvedValue(true);
      jest.spyOn(Order, 'create').mockRejectedValue(new Error('db down'));

      await expect(
        initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
        })
      ).rejects.toThrow('db down');
      expect(release).toHaveBeenCalledWith('r9');
    });

    describe('Sprint 13: promo codes and loyalty redemption', () => {
      const { PromoCode, Loyalty } = require('../../../src/models');

      beforeEach(() => {
        jest.spyOn(ProductVariant, 'findAll').mockResolvedValue([stockedVariant()]);
        jest.spyOn(reservationService, 'reserveStock').mockResolvedValue({ reservation_id: 'r1' });
        jest.spyOn(Order, 'create').mockResolvedValue({ id: 20, status: 'payment_pending' });
        jest.spyOn(OrderItem, 'bulkCreate').mockResolvedValue([]);
      });

      it('should apply a valid promo code discount to the order total', async () => {
        jest.spyOn(PromoCode, 'findOne').mockResolvedValue({
          id: 7,
          code: 'WELCOME10',
          discountType: 'percentage',
          discountValue: '10.00',
          minOrderAmount: '0.00',
          maxDiscountAmount: null,
          startDate: new Date('2020-01-01'),
          endDate: new Date('2099-01-01'),
          usageLimit: null,
          timesUsed: 0,
          isActive: true,
        });

        const result = await initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
          promoCode: 'welcome10',
        });

        expect(result.breakdown.discount_amount).toBe(300);
        expect(result.breakdown.total_amount).toBe(3150);
        expect(Order.create).toHaveBeenCalledWith(
          expect.objectContaining({ promoCodeId: 7, discountAmount: 300 }),
          expect.anything()
        );
      });

      it('should reject an invalid promo code before reserving stock', async () => {
        jest.spyOn(PromoCode, 'findOne').mockResolvedValue(null);
        const reserve = jest.spyOn(reservationService, 'reserveStock');

        await expect(
          initiateCheckout({
            customerId: 4,
            shippingAddress: validAddress,
            items: [{ variantId: 1, quantity: 1 }],
            promoCode: 'BOGUS',
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(reserve).not.toHaveBeenCalled();
      });

      it('should require sign-in to redeem loyalty points', async () => {
        await expect(
          initiateCheckout({
            customerId: null,
            guestEmail: 'guest@example.com',
            shippingAddress: validAddress,
            items: [{ variantId: 1, quantity: 1 }],
            redeemPoints: 100,
          })
        ).rejects.toMatchObject({ message: expect.stringMatching(/Sign in/) });
      });

      it('should reject redeeming more points than the customer has', async () => {
        jest.spyOn(Loyalty, 'findOne').mockResolvedValue({ customerId: 4, currentPoints: 50 });

        await expect(
          initiateCheckout({
            customerId: 4,
            shippingAddress: validAddress,
            items: [{ variantId: 1, quantity: 1 }],
            redeemPoints: 100,
          })
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it('should price redeemed points as an LKR-for-LKR discount and record it on the order', async () => {
        jest.spyOn(Loyalty, 'findOne').mockResolvedValue({ customerId: 4, currentPoints: 500 });

        const result = await initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
          redeemPoints: 200,
        });

        expect(result.breakdown.discount_amount).toBe(200);
        expect(Order.create).toHaveBeenCalledWith(
          expect.objectContaining({ loyaltyPointsRedeemed: 200, discountAmount: 200 }),
          expect.anything()
        );
      });

      it('should cap the combined promo + loyalty discount at the subtotal', async () => {
        jest.spyOn(PromoCode, 'findOne').mockResolvedValue({
          id: 7,
          code: 'BIG50',
          discountType: 'fixed_amount',
          discountValue: '2000.00',
          minOrderAmount: '0.00',
          maxDiscountAmount: null,
          startDate: new Date('2020-01-01'),
          endDate: new Date('2099-01-01'),
          usageLimit: null,
          timesUsed: 0,
          isActive: true,
        });
        jest.spyOn(Loyalty, 'findOne').mockResolvedValue({ customerId: 4, currentPoints: 5000 });

        const result = await initiateCheckout({
          customerId: 4,
          shippingAddress: validAddress,
          items: [{ variantId: 1, quantity: 1 }],
          promoCode: 'BIG50',
          redeemPoints: 2000,
        });

        // Subtotal is 3000; a 2000 promo + 2000-point redemption would exceed it.
        expect(result.breakdown.discount_amount).toBe(3000);
        expect(result.breakdown.total_amount).toBe(450);
      });
    });
  });
});
