const ApiError = require('../../../src/utils/ApiError');

jest.mock('../../../src/models', () => {
  return {
    Review: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    },
    ReviewImage: {
      bulkCreate: jest.fn(),
    },
    Order: {
      findAll: jest.fn(),
    },
    OrderItem: {},
    ProductVariant: {},
    Customer: {},
  };
});

const { Review, ReviewImage, Order } = require('../../../src/models');
const {
  createReview,
  getProductReviews,
  getCustomerReviews,
  getProductRatingStats,
  checkVerifiedBuyer,
} = require('../../../src/services/review.service');

describe('reviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProductRatingStats', () => {
    it('returns default 5.0 rating for product with no reviews', async () => {
      Review.findAll.mockResolvedValue([]);
      const stats = await getProductRatingStats(1);
      expect(stats.average_rating).toBe(5.0);
      expect(stats.review_count).toBe(0);
    });

    it('calculates average rating and breakdown', async () => {
      Review.findAll.mockResolvedValue([{ rating: 5 }, { rating: 4 }, { rating: 5 }]);

      const stats = await getProductRatingStats(1);
      expect(stats.average_rating).toBe(4.7);
      expect(stats.review_count).toBe(3);
      expect(stats.breakdown[5]).toBe(2);
      expect(stats.breakdown[4]).toBe(1);
    });
  });

  describe('checkVerifiedBuyer', () => {
    it('returns true if customer previously purchased product', async () => {
      Order.findAll.mockResolvedValue([{ items: [{ id: 1 }] }]);

      const verified = await checkVerifiedBuyer(4, 1);
      expect(verified).toBe(true);
    });

    it('returns false if customer has not purchased product', async () => {
      Order.findAll.mockResolvedValue([{ items: [] }]);

      const verified = await checkVerifiedBuyer(4, 1);
      expect(verified).toBe(false);
    });
  });

  describe('createReview', () => {
    it('throws validation error for invalid rating', async () => {
      await expect(createReview({ customerId: 4, productId: 1, rating: 6 })).rejects.toThrow(
        ApiError
      );

      await expect(createReview({ customerId: 4, productId: 1, rating: 0 })).rejects.toThrow(
        ApiError
      );
    });

    it('throws conflict if customer already submitted review', async () => {
      Review.findOne.mockResolvedValue({ id: 99 });
      await expect(createReview({ customerId: 4, productId: 1, rating: 5 })).rejects.toThrow(
        ApiError
      );
    });

    it('should return 403 given the customer never purchased the product', async () => {
      Review.findOne.mockResolvedValue(null);
      Order.findAll.mockResolvedValue([]);

      await expect(
        createReview({ customerId: 4, productId: 1, rating: 5, comment: 'Nice' })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(Review.create).not.toHaveBeenCalled();
    });

    it('should only count paid orders as purchases', async () => {
      Order.findAll.mockResolvedValue([]);

      await checkVerifiedBuyer(4, 1);

      expect(Order.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 4, status: ['confirmed', 'processing', 'shipped', 'delivered'] },
        })
      );
    });

    it('creates review and persists attached images', async () => {
      Review.findOne.mockResolvedValue(null);
      Order.findAll.mockResolvedValue([{ items: [{ id: 1 }] }]);
      Review.create.mockResolvedValue({ id: 10 });
      ReviewImage.bulkCreate.mockResolvedValue([]);
      Review.findByPk.mockResolvedValue({
        id: 10,
        productId: 1,
        customerId: 4,
        rating: 5,
        comment: 'Great quality batik!',
        customer: { name: 'Kavindu' },
        images: [{ imageUrl: 'https://example.com/photo1.jpg' }],
        createdAt: new Date(),
      });

      const result = await createReview({
        customerId: 4,
        productId: 1,
        rating: 5,
        comment: 'Great quality batik!',
        images: ['https://example.com/photo1.jpg'],
      });

      expect(result.id).toBe(10);
      expect(result.is_verified_buyer).toBe(true);
      expect(result.images).toContain('https://example.com/photo1.jpg');
    });
  });

  describe('getProductReviews', () => {
    it('returns reviews list with statistics summary', async () => {
      Review.findAll.mockResolvedValue([{ rating: 5 }]);
      Review.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: 10,
            productId: 1,
            customerId: 4,
            rating: 5,
            comment: 'Excellent!',
            customer: { name: 'Kavindu' },
            images: [],
            createdAt: new Date(),
          },
        ],
      });

      const res = await getProductReviews(1, { page: 1, limit: 10 });
      expect(res.stats.review_count).toBe(1);
      expect(res.reviews).toHaveLength(1);
      expect(res.reviews[0].comment).toBe('Excellent!');
    });
  });
});
