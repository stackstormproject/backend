const {
  calculateAvailableStock,
  formatVariant,
  slugify,
  getProductBySlug,
} = require('../../../src/services/product.service');
const { Product } = require('../../../src/models');

describe('productDetail Service - Variant Matrix & Stock Availability', () => {
  describe('calculateAvailableStock', () => {
    it('should correctly subtract reserved quantity from physical stock', () => {
      expect(calculateAvailableStock(10, 3)).toBe(7);
      expect(calculateAvailableStock(25, 0)).toBe(25);
    });

    it('should return 0 given reserved quantity exceeds stock quantity to avoid negative stock', () => {
      expect(calculateAvailableStock(5, 10)).toBe(0);
      expect(calculateAvailableStock(0, 5)).toBe(0);
    });

    it('should handle undefined or null values safely', () => {
      expect(calculateAvailableStock(undefined, null)).toBe(0);
    });
  });

  describe('slugify', () => {
    it('should generate URL-friendly slug from product title', () => {
      expect(slugify('Handloom Linen Batik Shirt')).toBe('handloom-linen-batik-shirt');
      expect(slugify('Women Classic Silk Sari 2026!')).toBe('women-classic-silk-sari-2026');
      expect(slugify('')).toBe('');
    });
  });

  describe('formatVariant', () => {
    it('should enrich variant object with real-time available stock', () => {
      const rawVariant = {
        id: 101,
        sku: 'SHIRT-BLU-L',
        size: 'L',
        color: 'Ocean Blue',
        stockQuantity: 15,
        reservedQuantity: 4,
      };

      const formatted = formatVariant(rawVariant);

      expect(formatted.available_stock).toBe(11);
      expect(formatted.availableStock).toBe(11);
      expect(formatted.sku).toBe('SHIRT-BLU-L');
    });
  });

  describe('getProductBySlug', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return null given non-existent slug', async () => {
      jest.spyOn(Product, 'findOne').mockResolvedValue(null);

      const result = await getProductBySlug('unknown-product');
      expect(result).toBeNull();
    });

    it('should return formatted product with sorted images and review stats given valid slug', async () => {
      const mockProduct = {
        id: 1,
        name: 'Handloom Batik Shirt',
        slug: 'handloom-batik-shirt',
        description: 'Authentic Sri Lankan cotton shirt',
        price: '4500.00',
        material: '100% Cotton',
        careInstructions: 'Hand wash cold',
        primaryImage: 'https://cdn.example.com/shirt-primary.jpg',
        categoryDetails: { id: 2, name: 'Batik Shirts' },
        variants: [
          {
            id: 11,
            sku: 'BATIK-M',
            size: 'M',
            color: 'Navy',
            stockQuantity: 8,
            reservedQuantity: 2,
            images: [
              { id: 201, imageUrl: 'https://cdn.example.com/img2.jpg', displayOrder: 2 },
              { id: 202, imageUrl: 'https://cdn.example.com/img1.jpg', displayOrder: 1 },
            ],
          },
        ],
        reviews: [
          { id: 1, rating: 5, comment: 'Great quality' },
          { id: 2, rating: 4, comment: 'Nice fit' },
        ],
      };

      jest.spyOn(Product, 'findOne').mockResolvedValue(mockProduct);

      const result = await getProductBySlug('handloom-batik-shirt');

      expect(result).toBeDefined();
      expect(result.name).toBe('Handloom Batik Shirt');
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].available_stock).toBe(6);

      // Verify gallery images sorted by displayOrder ASC
      expect(result.images).toHaveLength(2);
      expect(result.images[0].displayOrder).toBe(1);
      expect(result.images[1].displayOrder).toBe(2);

      // Verify review statistics
      expect(result.reviewsSummary.averageRating).toBe(4.5);
      expect(result.reviewsSummary.reviewCount).toBe(2);
    });

    it('should return null when slug is empty or falsy', async () => {
      const result = await getProductBySlug('');
      expect(result).toBeNull();
    });

    it('should query with numeric id when slug is numeric', async () => {
      const findOneSpy = jest.spyOn(Product, 'findOne').mockResolvedValue(null);

      await getProductBySlug('123');

      expect(findOneSpy).toHaveBeenCalled();
    });

    it('should fallback to primaryImage when variants have no images', async () => {
      const mockProduct = {
        id: 2,
        name: 'Plain Shirt',
        slug: 'plain-shirt',
        primaryImage: 'https://cdn.example.com/primary.jpg',
        variants: [],
        reviews: [],
      };

      jest.spyOn(Product, 'findOne').mockResolvedValue(mockProduct);

      const result = await getProductBySlug('plain-shirt');

      expect(result.images).toHaveLength(1);
      expect(result.images[0].imageUrl).toBe('https://cdn.example.com/primary.jpg');
      expect(result.images[0].isPrimary).toBe(true);
    });
  });
});
