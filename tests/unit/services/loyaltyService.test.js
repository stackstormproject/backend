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
      transaction: jest.fn(async (cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
    },
  };
});

const { Loyalty, LoyaltyTransaction, Customer } = require('../../../src/models');
const {
  getLoyaltyAccount,
  getLoyaltyTransactions,
  redeemPoints,
  calculatePoints,
  priceRedemption,
  settleOrderLoyalty,
  EARN_THRESHOLD_LKR,
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
      // The balance row is locked, so concurrent redemptions cannot double-spend.
      expect(Loyalty.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: 'UPDATE' }));
    });
  });

  describe('priceRedemption', () => {
    it('should return 0 for zero, negative or missing points', async () => {
      expect(await priceRedemption(4, 0)).toBe(0);
      expect(await priceRedemption(4, -5)).toBe(0);
      expect(await priceRedemption(4, undefined)).toBe(0);
    });

    it('should reject a redemption the customer cannot afford', async () => {
      Loyalty.findOne.mockResolvedValue({ customerId: 4, currentPoints: 50 });

      await expect(priceRedemption(4, 100)).rejects.toThrow(ApiError);
    });

    it('should reject when the customer has no loyalty account at all', async () => {
      Loyalty.findOne.mockResolvedValue(null);

      await expect(priceRedemption(4, 100)).rejects.toThrow(ApiError);
    });

    it('should price points at 1 LKR each without touching the balance', async () => {
      Loyalty.findOne.mockResolvedValue({ customerId: 4, currentPoints: 200 });

      const discount = await priceRedemption(4, 150);

      expect(discount).toBe(150);
      expect(Loyalty.findOne).toHaveBeenCalledWith({ where: { customerId: 4 } });
    });
  });

  describe('settleOrderLoyalty', () => {
    const order = (overrides = {}) => ({
      id: 42,
      customerId: 4,
      loyaltyPointsRedeemed: 0,
      ...overrides,
    });

    it('should do nothing for a guest order with no customer', async () => {
      const result = await settleOrderLoyalty(order({ customerId: null }), 20000);

      expect(result).toEqual({ earned: 0, redeemed: 0 });
      expect(Loyalty.findOne).not.toHaveBeenCalled();
    });

    it('should do nothing when there is nothing to earn or redeem', async () => {
      const result = await settleOrderLoyalty(order(), EARN_THRESHOLD_LKR - 1);

      expect(result).toEqual({ earned: 0, redeemed: 0 });
    });

    it('should award points once the goods subtotal reaches the earn threshold', async () => {
      Loyalty.findOne
        .mockResolvedValueOnce({
          customerId: 4,
          tier: 'silver',
          currentPoints: 0,
          lifetimePoints: 0,
        })
        .mockResolvedValueOnce({
          customerId: 4,
          currentPoints: 0,
          lifetimePoints: 0,
          update: jest.fn(),
        });
      LoyaltyTransaction.create.mockResolvedValue({});
      Customer.update.mockResolvedValue({});

      const result = await settleOrderLoyalty(order(), EARN_THRESHOLD_LKR);

      expect(result).toEqual({ earned: 100, redeemed: 0 });
      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ points: 100, transactionType: 'earned' }),
        expect.anything()
      );
    });

    it('should spend redeemed points and record the redemption', async () => {
      const update = jest.fn();
      Loyalty.findOne.mockResolvedValue({
        customerId: 4,
        currentPoints: 300,
        lifetimePoints: 300,
        update,
      });
      LoyaltyTransaction.create.mockResolvedValue({});
      Customer.update.mockResolvedValue({});

      const result = await settleOrderLoyalty(order({ loyaltyPointsRedeemed: 150 }), 5000);

      expect(result).toEqual({ earned: 0, redeemed: 150 });
      expect(update).toHaveBeenCalledWith(
        { currentPoints: 150, lifetimePoints: 300 },
        expect.anything()
      );
      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ points: -150, transactionType: 'redeemed' }),
        expect.anything()
      );
    });

    it('should skip the redemption gracefully when the balance moved since checkout', async () => {
      const update = jest.fn();
      Loyalty.findOne.mockResolvedValue({ customerId: 4, currentPoints: 10, update });

      // The reported figures reflect what checkout priced, not whether the balance actually
      // moved - the important thing is the account itself is left untouched.
      const result = await settleOrderLoyalty(order({ loyaltyPointsRedeemed: 150 }), 5000);

      expect(result).toEqual({ earned: 0, redeemed: 150 });
      expect(update).not.toHaveBeenCalled();
    });

    it('should leave the account untouched when it no longer exists', async () => {
      Loyalty.findOne.mockResolvedValue(null);

      const result = await settleOrderLoyalty(order({ loyaltyPointsRedeemed: 50 }), 5000);

      expect(result).toEqual({ earned: 0, redeemed: 50 });
      expect(LoyaltyTransaction.create).not.toHaveBeenCalled();
    });
  });
});
