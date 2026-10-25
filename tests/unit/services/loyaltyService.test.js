const ApiError = require('../../../src/utils/ApiError');

jest.mock('../../../src/models', () => {
  return {
    Loyalty: {
      findOne: jest.fn(),
      create: jest.fn(),
    },
    LoyaltyTransaction: {
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    },
    Customer: {
      findByPk: jest.fn(),
      update: jest.fn(),
    },
    sequelize: {
      transaction: jest.fn(async (cb) => cb({})),
    },
  };
});

const { Loyalty, LoyaltyTransaction, Customer } = require('../../../src/models');
const {
  getLoyaltyAccount,
  getLoyaltyTransactions,
  redeemPoints,
  calculatePoints,
} = require('../../../src/services/loyalty.service');

describe('loyaltyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePoints', () => {
    it('calculates points per tier multiplier correctly', () => {
      // 10,000 LKR purchase:
      // Silver (1.0x): 100 pts
      // Gold (1.5x): 150 pts
      // Platinum (2.0x): 200 pts
      expect(calculatePoints(10000, 'silver')).toBe(100);
      expect(calculatePoints(10000, 'gold')).toBe(150);
      expect(calculatePoints(10000, 'platinum')).toBe(200);
      expect(calculatePoints(0, 'silver')).toBe(0);
      expect(calculatePoints(-50, 'silver')).toBe(0);
    });
  });

  describe('getLoyaltyAccount', () => {
    it('returns existing loyalty account with tier benefits', async () => {
      Loyalty.findOne.mockResolvedValue({
        customerId: 4,
        tier: 'gold',
        currentPoints: 450,
        lifetimePoints: 1200,
        tierStartDate: new Date('2026-01-01'),
      });

      const res = await getLoyaltyAccount(4);
      expect(res.tier).toBe('gold');
      expect(res.current_points).toBe(450);
      expect(res.tier_multiplier).toBe(1.5);
      expect(res.benefits.length).toBeGreaterThan(0);
    });

    it('creates default silver account if not found', async () => {
      Loyalty.findOne.mockResolvedValue(null);
      Customer.findByPk.mockResolvedValue({
        id: 4,
        loyaltyTier: 'silver',
        loyaltyPoints: 0,
      });
      Loyalty.create.mockResolvedValue({
        customerId: 4,
        tier: 'silver',
        currentPoints: 0,
        lifetimePoints: 0,
        tierStartDate: new Date(),
      });

      const res = await getLoyaltyAccount(4);
      expect(res.tier).toBe('silver');
      expect(res.current_points).toBe(0);
    });
  });

  describe('getLoyaltyTransactions', () => {
    it('returns paginated transactions list', async () => {
      LoyaltyTransaction.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 1,
            customerId: 4,
            points: 100,
            transactionType: 'earned',
            description: 'Order purchase #12',
            createdAt: new Date(),
          },
        ],
      });

      const res = await getLoyaltyTransactions(4, { page: 1, limit: 10 });
      expect(res.transactions).toHaveLength(1);
      expect(res.transactions[0].points).toBe(100);
      expect(res.transactions[0].transaction_type).toBe('earned');
    });
  });

  describe('redeemPoints', () => {
    it('throws conflict if balance is insufficient', async () => {
      Loyalty.findOne.mockResolvedValue({
        customerId: 4,
        currentPoints: 50,
      });

      await expect(redeemPoints(4, 100)).rejects.toThrow(ApiError);
    });

    it('deducts points and records transaction when balance is sufficient', async () => {
      const mockUpdate = jest.fn();
      Loyalty.findOne.mockResolvedValue({
        customerId: 4,
        currentPoints: 200,
        update: mockUpdate,
      });
      LoyaltyTransaction.create.mockResolvedValue({});
      Customer.update.mockResolvedValue({});

      const res = await redeemPoints(4, 150, 'Voucher discount');
      expect(res.success).toBe(true);
      expect(res.redeemed_points).toBe(150);
      expect(res.new_balance).toBe(50);
      expect(mockUpdate).toHaveBeenCalledWith({ currentPoints: 50 }, expect.anything());
    });
  });
});
