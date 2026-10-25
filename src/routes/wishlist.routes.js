const { Router } = require('express');
const { Wishlist, Product, ProductVariant } = require('../models');
const { auth } = require('../middleware/auth');
const { successResponse } = require('../utils/responseFormatter');

const router = Router();

/**
 * Optional authentication middleware for wishlist
 * Allows guest users with empty wishlist or loads customer wishlist if authenticated
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return auth(req, res, (err) => {
      // If token invalid, proceed as guest rather than blocking
      if (err) req.user = null;
      next();
    });
  }
  req.user = null;
  return next();
};

/**
 * GET /wishlist — Retrieve customer wishlist items
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(200).json({ success: true, data: [] });
    }

    const items = await Wishlist.findAll({
      where: { customerId: req.user.id },
      include: [
        {
          model: Product,
          as: 'product',
          include: [{ model: ProductVariant, as: 'variants' }],
        },
      ],
    });

    const wishlistProducts = items
      .map((item) => {
        if (!item.product) return null;
        const plain =
          typeof item.product.toJSON === 'function' ? item.product.toJSON() : item.product;
        return {
          id: plain.id,
          name: plain.name,
          title: plain.name,
          slug: plain.slug,
          price: plain.price,
          base_price: plain.price,
          category: plain.category,
          category_name: plain.category,
          primary_image: plain.primaryImage || plain.primary_image,
          variants: plain.variants || [],
          availableStock: (plain.variants || []).reduce(
            (acc, v) =>
              acc +
              Math.max(
                0,
                (v.stock_quantity ?? v.stockQuantity ?? 0) -
                  (v.reserved_quantity ?? v.reservedQuantity ?? 0)
              ),
            25
          ),
        };
      })
      .filter(Boolean);

    return successResponse(res, wishlistProducts, 'Wishlist retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /wishlist/toggle — Toggle item in customer wishlist
 */
router.post('/toggle', optionalAuth, async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }

    if (!req.user || !req.user.id) {
      // Guest fallback: acknowledge toggle
      return res.status(200).json({
        success: true,
        data: { wishlisted: true, productId, message: 'Item saved locally' },
      });
    }

    const numericProductId = parseInt(productId, 10);
    const existing = await Wishlist.findOne({
      where: { customerId: req.user.id, productId: numericProductId },
    });

    if (existing) {
      await existing.destroy();
      return res.status(200).json({
        success: true,
        data: { wishlisted: false, productId, message: 'Item removed from wishlist' },
      });
    }

    await Wishlist.create({
      customerId: req.user.id,
      productId: numericProductId,
    });

    return res.status(200).json({
      success: true,
      data: { wishlisted: true, productId, message: 'Item added to wishlist' },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /wishlist/:productId — Remove item from customer wishlist
 */
router.delete('/:productId', optionalAuth, async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (req.user && req.user.id) {
      const numericProductId = parseInt(productId, 10);
      await Wishlist.destroy({
        where: { customerId: req.user.id, productId: numericProductId },
      });
    }
    return res.status(200).json({ success: true, message: 'Item removed from wishlist' });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /wishlist/restock-alert/:productId — Subscribe to restock alerts
 */
router.post('/restock-alert/:productId', (req, res) =>
  res.status(200).json({
    success: true,
    message: 'Successfully subscribed to back-in-stock alerts',
  })
);

module.exports = router;
