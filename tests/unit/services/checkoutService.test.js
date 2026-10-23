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
});
