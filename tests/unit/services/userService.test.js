const ApiError = require('../../../src/utils/ApiError');

jest.mock('../../../src/models', () => {
  return {
    Customer: {
      findByPk: jest.fn(),
      update: jest.fn(),
    },
    Address: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    Loyalty: {},
    sequelize: {
      transaction: jest.fn(async (cb) => cb({})),
    },
  };
});

const { Customer, Address } = require('../../../src/models');
const {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  isValidPhone,
  formatAddress,
} = require('../../../src/services/user.service');

describe('userService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidPhone', () => {
    it('validates standard E.164 and Sri Lankan phone formats', () => {
      expect(isValidPhone('+94771234567')).toBe(true);
      expect(isValidPhone('0771234567')).toBe(true);
      expect(isValidPhone('077-123-4567')).toBe(true);
      expect(isValidPhone('invalid')).toBe(false);
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone(null)).toBe(false);
    });
  });

  describe('formatAddress', () => {
    it('returns formatted DTO from address object', () => {
      const formatted = formatAddress({
        id: 1,
        customerId: 4,
        addressLine1: '123 Main St',
        addressLine2: 'Apt 2',
        city: 'Colombo',
        state: 'Western',
        postalCode: '00100',
        country: 'Sri Lanka',
        isDefault: true,
      });

      expect(formatted.id).toBe(1);
      expect(formatted.address_line1).toBe('123 Main St');
      expect(formatted.addressLine1).toBe('123 Main St');
      expect(formatted.city).toBe('Colombo');
      expect(formatted.postal_code).toBe('00100');
      expect(formatted.is_default).toBe(true);
    });

    it('returns null if address is null', () => {
      expect(formatAddress(null)).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('throws unauthorized when customerId is missing', async () => {
      await expect(getProfile(null)).rejects.toThrow(ApiError);
    });

    it('throws not found when customer does not exist', async () => {
      Customer.findByPk.mockResolvedValue(null);
      await expect(getProfile(999)).rejects.toThrow(ApiError);
    });

    it('returns customer profile with formatted addresses and loyalty details', async () => {
      Customer.findByPk.mockResolvedValue({
        id: 4,
        name: 'Kavindu Pabasara',
        email: 'bgkpabasara@gmail.com',
        phone: '0740033442',
        loyaltyTier: 'silver',
        loyaltyPoints: 150,
        addresses: [
          {
            id: 1,
            customerId: 4,
            addressLine1: '45 Lotus Road',
            city: 'Colombo',
            postalCode: '00100',
            isDefault: true,
          },
        ],
        loyalty: { tier: 'gold', currentPoints: 250 },
      });

      const profile = await getProfile(4);
      expect(profile.id).toBe(4);
      expect(profile.name).toBe('Kavindu Pabasara');
      expect(profile.email).toBe('bgkpabasara@gmail.com');
      expect(profile.loyalty_tier).toBe('gold');
      expect(profile.loyalty_points).toBe(250);
      expect(profile.addresses).toHaveLength(1);
      expect(profile.addresses[0].address_line1).toBe('45 Lotus Road');
    });
  });

  describe('updateProfile', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(updateProfile(null, { name: 'Test' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('throws not found if customer does not exist', async () => {
      Customer.findByPk.mockResolvedValue(null);
      await expect(updateProfile(999, { name: 'Test' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws bad request if phone number format is invalid', async () => {
      Customer.findByPk.mockResolvedValue({
        id: 4,
        update: jest.fn(),
      });

      await expect(updateProfile(4, { phone: 'not-a-phone' })).rejects.toThrow(ApiError);
    });

    it('updates customer name and phone', async () => {
      const mockUpdate = jest.fn();
      Customer.findByPk.mockResolvedValueOnce({
        id: 4,
        name: 'Kavindu',
        phone: '0771234567',
        update: mockUpdate,
      });

      Customer.findByPk.mockResolvedValueOnce({
        id: 4,
        name: 'Kavindu Updated',
        email: 'bgkpabasara@gmail.com',
        phone: '0740033442',
        loyaltyTier: 'silver',
        loyaltyPoints: 0,
        addresses: [],
      });

      const result = await updateProfile(4, { name: 'Kavindu Updated', phone: '0740033442' });
      expect(mockUpdate).toHaveBeenCalledWith({ name: 'Kavindu Updated', phone: '0740033442' });
      expect(result.name).toBe('Kavindu Updated');
    });
  });

  describe('getAddresses', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(getAddresses(null)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('returns customer address list', async () => {
      Address.findAll.mockResolvedValue([
        {
          id: 10,
          customerId: 4,
          addressLine1: '88 Beach Road',
          city: 'Dickwella',
          postalCode: '81200',
          isDefault: true,
        },
      ]);

      const list = await getAddresses(4);
      expect(list).toHaveLength(1);
      expect(list[0].city).toBe('Dickwella');
      expect(list[0].is_default).toBe(true);
    });
  });

  describe('addAddress', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(addAddress(null, {})).rejects.toMatchObject({ statusCode: 401 });
    });

    it('validates required fields', async () => {
      await expect(addAddress(4, { city: 'Colombo' })).rejects.toThrow(ApiError);
      await expect(addAddress(4, { address_line1: 'Road' })).rejects.toThrow(ApiError);
      await expect(
        addAddress(4, { address_line1: 'Road', city: 'Colombo', postal_code: '' })
      ).rejects.toThrow(ApiError);
    });

    it('creates address and marks as default if requested or first address', async () => {
      Address.count.mockResolvedValue(0);
      Address.create.mockResolvedValue({
        id: 101,
        customerId: 4,
        addressLine1: '12 Temple St',
        city: 'Kandy',
        postalCode: '20000',
        country: 'Sri Lanka',
        isDefault: true,
      });

      const result = await addAddress(4, {
        address_line1: '12 Temple St',
        city: 'Kandy',
        postal_code: '20000',
      });

      expect(result.id).toBe(101);
      expect(result.is_default).toBe(true);
    });
  });

  describe('updateAddress', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(updateAddress(null, 1, {})).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws bad request if addressId is missing', async () => {
      await expect(updateAddress(4, null, {})).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws not found if address does not exist', async () => {
      Address.findByPk.mockResolvedValue(null);
      await expect(updateAddress(4, 999, {})).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws forbidden if address belongs to another customer', async () => {
      Address.findByPk.mockResolvedValue({
        id: 55,
        customerId: 99,
      });

      await expect(updateAddress(4, 55, { city: 'Galle' })).rejects.toThrow(ApiError);
    });

    it('updates address fields cleanly and handles isDefault toggle', async () => {
      const mockUpdate = jest.fn().mockImplementation((fields) => ({
        id: 55,
        customerId: 4,
        addressLine1: fields.addressLine1 || 'Old St',
        city: fields.city || 'Old City',
        postalCode: '81200',
        isDefault: fields.isDefault ?? false,
      }));

      Address.findByPk.mockResolvedValue({
        id: 55,
        customerId: 4,
        addressLine1: 'Old St',
        city: 'Old City',
        update: mockUpdate,
      });

      const updated = await updateAddress(4, 55, {
        city: 'New City',
        is_default: true,
        address_line1: 'Updated St',
        address_line2: 'Suite 2',
        state: 'Southern',
        postal_code: '81200',
        country: 'Sri Lanka',
      });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'New City', isDefault: true }),
        expect.anything()
      );
      expect(updated.city).toBe('New City');
    });

    it('updates address to setDefault via helper', async () => {
      const mockUpdate = jest.fn().mockImplementation((fields) => ({
        id: 55,
        customerId: 4,
        addressLine1: 'Old St',
        city: 'Old City',
        postalCode: '81200',
        isDefault: fields.isDefault,
      }));

      Address.findByPk.mockResolvedValue({
        id: 55,
        customerId: 4,
        addressLine1: 'Old St',
        city: 'Old City',
        update: mockUpdate,
      });

      const updated = await setDefaultAddress(4, 55);
      expect(updated.is_default).toBe(true);
    });
  });

  describe('deleteAddress', () => {
    it('throws unauthorized if customerId is missing', async () => {
      await expect(deleteAddress(null, 1)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws bad request if addressId is missing', async () => {
      await expect(deleteAddress(4, null)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws not found if address does not exist', async () => {
      Address.findByPk.mockResolvedValue(null);
      await expect(deleteAddress(4, 999)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws forbidden if address belongs to another customer', async () => {
      Address.findByPk.mockResolvedValue({
        id: 20,
        customerId: 99,
      });

      await expect(deleteAddress(4, 20)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('destroys address and promotes next if default', async () => {
      const mockDestroy = jest.fn();
      const mockPromote = jest.fn();
      Address.findByPk.mockResolvedValue({
        id: 20,
        customerId: 4,
        isDefault: true,
        destroy: mockDestroy,
      });

      Address.findOne.mockResolvedValue({
        id: 21,
        customerId: 4,
        update: mockPromote,
      });

      const result = await deleteAddress(4, 20);
      expect(mockDestroy).toHaveBeenCalled();
      expect(mockPromote).toHaveBeenCalledWith({ isDefault: true });
      expect(result.deleted).toBe(true);
    });

    it('destroys address without promoting when address was not default', async () => {
      const mockDestroy = jest.fn();
      Address.findByPk.mockResolvedValue({
        id: 25,
        customerId: 4,
        isDefault: false,
        destroy: mockDestroy,
      });

      const result = await deleteAddress(4, 25);
      expect(mockDestroy).toHaveBeenCalled();
      expect(result.deleted).toBe(true);
    });
  });
});
