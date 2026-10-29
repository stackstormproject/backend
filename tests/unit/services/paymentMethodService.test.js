jest.mock('../../../src/models', () => ({
  PaymentMethod: { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn(), count: jest.fn() },
  sequelize: { transaction: jest.fn((work) => work('trx')) },
}));
jest.mock('../../../src/config/logger', () => ({ warn: jest.fn() }));

const { PaymentMethod } = require('../../../src/models');
const logger = require('../../../src/config/logger');
const service = require('../../../src/services/paymentMethod.service');

// Refs #190
const record = (overrides = {}) => ({
  id: 1,
  provider: 'stripe',
  providerRef: 'pm_1',
  brand: 'visa',
  last4: '4242',
  expMonth: 1,
  expYear: 2030,
  isDefault: true,
  destroy: jest.fn(),
  update: jest.fn(),
  ...overrides,
});

describe('paymentMethod service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PaymentMethod.findAll.mockResolvedValue([]);
  });

  it('should ignore a Stripe payment method without a card', async () => {
    await expect(service.saveFromStripe(4, { id: 'pm_1' })).resolves.toBeNull();
    await expect(service.saveFromStripe(4, null)).resolves.toBeNull();
  });

  it('should store brand, last four and expiry from Stripe', async () => {
    PaymentMethod.findOne.mockResolvedValue(null);
    PaymentMethod.count.mockResolvedValue(0);
    PaymentMethod.create = jest.fn(async (data) => ({ id: 2, ...data }));

    await service.saveFromStripe(4, {
      id: 'pm_9',
      card: { brand: 'amex', last4: '0005', exp_month: 7, exp_year: 2031 },
    });

    expect(PaymentMethod.create).toHaveBeenCalledWith(
      {
        provider: 'stripe',
        providerRef: 'pm_9',
        brand: 'amex',
        last4: '0005',
        expMonth: 7,
        expYear: 2031,
        customerId: 4,
        isDefault: true,
      },
      { transaction: 'trx' }
    );
  });

  it('should refuse an unknown card', async () => {
    PaymentMethod.findOne.mockResolvedValue(null);
    await expect(service.setDefault(4, 9)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.remove(4, 9)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('should still remove the card when Stripe cannot detach it', async () => {
    const pm = record();
    PaymentMethod.findOne.mockResolvedValueOnce(pm).mockResolvedValueOnce(null);
    const detach = jest.fn().mockRejectedValue(new Error('No such PaymentMethod'));

    await service.remove(4, 1, detach);

    expect(detach).toHaveBeenCalledWith('pm_1');
    expect(logger.warn).toHaveBeenCalled();
    expect(pm.destroy).toHaveBeenCalled();
  });

  it('should not call Stripe for a test card', async () => {
    const pm = record({ provider: 'test', isDefault: false });
    PaymentMethod.findOne.mockResolvedValueOnce(pm);
    const detach = jest.fn();

    await service.remove(4, 1, detach);

    expect(detach).not.toHaveBeenCalled();
    expect(pm.destroy).toHaveBeenCalled();
  });
});
