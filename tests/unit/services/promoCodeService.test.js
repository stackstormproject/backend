jest.mock('../../../src/models', () => ({
  PromoCode: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    increment: jest.fn(),
  },
}));

const { UniqueConstraintError } = require('sequelize');
const { PromoCode } = require('../../../src/models');
const service = require('../../../src/services/promoCode.service');

// Sprint 13 (FR-015): promo code admin CRUD plus checkout pricing.
const promo = (overrides = {}) => ({
  id: 1,
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
  update: jest.fn(function update(fields) {
    Object.assign(this, fields);
  }),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('promoCodeService.createPromoCode', () => {
  it.each([
    [{}],
    [{ code: 'x' }],
    [{ code: 'WELCOME10', discount_type: 'bogus', discount_value: 10 }],
    [{ code: 'WELCOME10', discount_type: 'percentage', discount_value: 150 }],
    [{ code: 'WELCOME10', discount_type: 'percentage', discount_value: 10, start_date: 'bad' }],
  ])('should reject %p', async (body) => {
    await expect(service.createPromoCode(body)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject an end date on or before the start date', async () => {
    await expect(
      service.createPromoCode({
        code: 'WELCOME10',
        discount_type: 'percentage',
        discount_value: 10,
        start_date: '2026-06-01',
        end_date: '2026-05-01',
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/after the start date/) });
  });

  it('should save a normalized code with defaults', async () => {
    PromoCode.create.mockImplementation(async (fields) => promo({ id: 5, ...fields }));

    const result = await service.createPromoCode({
      code: ' welcome10 ',
      discount_type: 'percentage',
      discount_value: 10,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });

    expect(PromoCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WELCOME10', discountType: 'percentage', discountValue: 10 })
    );
    expect(result).toMatchObject({ id: 5, code: 'WELCOME10' });
  });

  it('should report a duplicate code as a conflict', async () => {
    PromoCode.create.mockRejectedValue(new UniqueConstraintError({ errors: [] }));

    await expect(
      service.createPromoCode({
        code: 'WELCOME10',
        discount_type: 'percentage',
        discount_value: 10,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('promoCodeService.updatePromoCode', () => {
  it('should 404 when the promo code is missing', async () => {
    PromoCode.findByPk.mockResolvedValue(null);

    await expect(service.updatePromoCode(9, { is_active: false })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('should partially update an existing promo code', async () => {
    const existing = promo();
    PromoCode.findByPk.mockResolvedValue(existing);

    const result = await service.updatePromoCode(1, { is_active: false });

    expect(existing.update).toHaveBeenCalledWith({ isActive: false });
    expect(result.is_active).toBe(false);
  });
});

describe('promoCodeService.deletePromoCode', () => {
  it('should delete and 404 when already gone', async () => {
    PromoCode.destroy.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await service.deletePromoCode(1);
    await expect(service.deletePromoCode(1)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('promoCodeService.validateAndPrice', () => {
  it('should reject an empty code', async () => {
    await expect(service.validateAndPrice('', 5000)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reject an unknown or inactive code', async () => {
    PromoCode.findOne.mockResolvedValue(null);
    await expect(service.validateAndPrice('NOPE', 5000)).rejects.toMatchObject({
      message: expect.stringMatching(/not valid/),
    });

    PromoCode.findOne.mockResolvedValue(promo({ isActive: false }));
    await expect(service.validateAndPrice('WELCOME10', 5000)).rejects.toMatchObject({
      message: expect.stringMatching(/not valid/),
    });
  });

  it('should reject a code outside its active date window', async () => {
    PromoCode.findOne.mockResolvedValue(
      promo({ startDate: new Date('2099-01-01'), endDate: new Date('2099-06-01') })
    );

    await expect(service.validateAndPrice('WELCOME10', 5000)).rejects.toMatchObject({
      message: expect.stringMatching(/not active right now/),
    });
  });

  it('should reject a code that has hit its usage limit', async () => {
    PromoCode.findOne.mockResolvedValue(promo({ usageLimit: 1, timesUsed: 1 }));

    await expect(service.validateAndPrice('WELCOME10', 5000)).rejects.toMatchObject({
      message: expect.stringMatching(/usage limit/),
    });
  });

  it('should reject a subtotal below the minimum order amount', async () => {
    PromoCode.findOne.mockResolvedValue(promo({ minOrderAmount: '10000.00' }));

    await expect(service.validateAndPrice('WELCOME10', 5000)).rejects.toMatchObject({
      message: expect.stringMatching(/minimum order of LKR 10,000/),
    });
  });

  it('should price a percentage discount', async () => {
    PromoCode.findOne.mockResolvedValue(
      promo({ discountType: 'percentage', discountValue: '10.00' })
    );

    const result = await service.validateAndPrice('welcome10', 5000);

    expect(result).toEqual({ promoCodeId: 1, code: 'WELCOME10', discountAmount: 500 });
  });

  it('should price a fixed-amount discount', async () => {
    PromoCode.findOne.mockResolvedValue(
      promo({ discountType: 'fixed_amount', discountValue: '750.00' })
    );

    const result = await service.validateAndPrice('WELCOME10', 5000);

    expect(result.discountAmount).toBe(750);
  });

  it('should cap the discount at max_discount_amount', async () => {
    PromoCode.findOne.mockResolvedValue(
      promo({ discountType: 'percentage', discountValue: '50.00', maxDiscountAmount: '1000.00' })
    );

    const result = await service.validateAndPrice('WELCOME10', 10000);

    expect(result.discountAmount).toBe(1000);
  });

  it('should never discount more than the subtotal itself', async () => {
    PromoCode.findOne.mockResolvedValue(
      promo({ discountType: 'fixed_amount', discountValue: '9999.00' })
    );

    const result = await service.validateAndPrice('WELCOME10', 500);

    expect(result.discountAmount).toBe(500);
  });
});

describe('promoCodeService.recordUsage', () => {
  it('should do nothing without a promo code id', async () => {
    await service.recordUsage(null);
    expect(PromoCode.increment).not.toHaveBeenCalled();
  });

  it('should increment times_used for the given promo code', async () => {
    await service.recordUsage(1, 'txn');
    expect(PromoCode.increment).toHaveBeenCalledWith(
      'timesUsed',
      expect.objectContaining({ by: 1, where: { id: 1 }, transaction: 'txn' })
    );
  });
});
