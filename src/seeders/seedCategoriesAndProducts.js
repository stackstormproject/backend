/* eslint-disable */
const { Category, Product, ProductVariant } = require('../models');

async function seedCategoriesAndProducts() {
  const rootCategories = [
    {
      id: 1,
      name: 'Men',
      slug: 'men',
      description: "Men's clothing, batik shirts, formal wear, and accessories",
      sort_order: 1,
      is_active: true,
    },
    {
      id: 2,
      name: 'Women',
      slug: 'women',
      description: "Women's designer silk saris, linen dresses, kurtis, and modern wear",
      sort_order: 2,
      is_active: true,
    },
    {
      id: 3,
      name: 'Kids',
      slug: 'kids',
      description: 'Festive traditional sarong sets and comfortable cotton clothing',
      sort_order: 3,
      is_active: true,
    },
    {
      id: 4,
      name: 'Accessories',
      slug: 'accessories',
      description: 'Artisan handcrafted belts, Dumbara shawls, and leather goods',
      sort_order: 4,
      is_active: true,
    },
  ];

  for (const cat of rootCategories) {
    const existing = await Category.findByPk(cat.id);
    if (!existing) {
      await Category.create(cat);
    } else {
      await existing.update(cat);
    }
  }

  const subCategories = [
    {
      id: 11,
      name: 'Batik Shirts',
      slug: 'men-batik-shirts',
      parent_id: 1,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 12,
      name: 'Linen Casual Shirts',
      slug: 'men-linen-casual-shirts',
      parent_id: 1,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 13,
      name: 'Formal Trousers',
      slug: 'men-formal-trousers',
      parent_id: 1,
      sort_order: 3,
      is_active: true,
    },
    {
      id: 14,
      name: 'Casual Tees & Polos',
      slug: 'men-casual-tees-polos',
      parent_id: 1,
      sort_order: 4,
      is_active: true,
    },
    {
      id: 21,
      name: 'Silk Saris',
      slug: 'women-silk-saris',
      parent_id: 2,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 22,
      name: 'Linen Dresses',
      slug: 'women-linen-dresses',
      parent_id: 2,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 23,
      name: 'Traditional Kurtis',
      slug: 'women-traditional-kurtis',
      parent_id: 2,
      sort_order: 3,
      is_active: true,
    },
    {
      id: 24,
      name: 'Blouses & Tops',
      slug: 'women-blouses-tops',
      parent_id: 2,
      sort_order: 4,
      is_active: true,
    },
    {
      id: 31,
      name: 'Traditional Sarongs & Kits',
      slug: 'kids-traditional-sarongs',
      parent_id: 3,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 32,
      name: 'Party Wear',
      slug: 'kids-party-wear',
      parent_id: 3,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 41,
      name: 'Belts & Wallets',
      slug: 'accessories-belts-wallets',
      parent_id: 4,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 42,
      name: 'Shawls & Bags',
      slug: 'accessories-shawls-bags',
      parent_id: 4,
      sort_order: 2,
      is_active: true,
    },
  ];

  for (const sub of subCategories) {
    const existing = await Category.findByPk(sub.id);
    if (!existing) {
      await Category.create(sub);
    } else {
      await existing.update(sub);
    }
  }

  // Update existing products with categoryId
  await Product.update({ categoryId: 1, category: 'Men' }, { where: { id: [1, 2, 3, 4, 5] } });

  // Add rich handloom, batik, and saree products if they don't exist
  const artisanProducts = [
    {
      id: 6,
      name: 'Signature Linen Batik Shirt',
      slug: 'signature-linen-batik-shirt',
      description:
        'Authentic Sri Lankan wax-resist dyed batik shirt in breathable tropical cotton and washed linen.',
      price: 4500.0,
      category: 'Men',
      categoryId: 11,
      brand: 'Dickwella Atelier',
      material: 'Organic Linen & Handloom Batik',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 7,
      name: 'Heritage Indigo Handloom Batik Shirt',
      slug: 'heritage-indigo-handloom-batik-shirt',
      description:
        'Deep indigo handloom cotton with traditional geometric batik motifs handcrafted in southern Sri Lanka.',
      price: 6200.0,
      category: 'Men',
      categoryId: 11,
      brand: 'Dickwella Atelier',
      material: '100% Handloom Cotton',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1620012253295-c15c429f66bf?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 8,
      name: 'Pure Handloom Cotton Saree',
      slug: 'pure-handloom-cotton-saree',
      description:
        'Handwoven on pit looms in Dickwella with natural vegetable dyes, gold borders, and elegant drape.',
      price: 12500.0,
      category: 'Women',
      categoryId: 21,
      brand: 'Dickwella Atelier',
      material: 'Pure Handloom Cotton',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 9,
      name: 'Artisan Silk Batik Kurti',
      slug: 'artisan-silk-batik-kurti',
      description:
        'Lustrous raw silk tunic featuring hand-painted botanical wax-resist motifs and hand-finished borders.',
      price: 7800.0,
      category: 'Women',
      categoryId: 23,
      brand: 'Dickwella Atelier',
      material: 'Raw Silk & Batik',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 10,
      name: 'Dickwella Gold-Border Linen Saree',
      slug: 'dickwella-gold-border-linen-saree',
      description:
        'Airy linen saree woven with metallic zari threads, celebrating Southern Province craftsmanship.',
      price: 14800.0,
      category: 'Women',
      categoryId: 21,
      brand: 'Dickwella Atelier',
      material: 'Fine Washed Linen',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 11,
      name: 'Dumbara Handloom Casual Sarong',
      slug: 'dumbara-handloom-casual-sarong',
      description:
        'Authentic UNESCO-inscribed Dumbara weave sarong in bold contrast hues with hand-tied tassels.',
      price: 3900.0,
      category: 'Men',
      categoryId: 1,
      brand: 'Dickwella Atelier',
      material: 'Dumbara Handloom Cotton',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1506152983158-b4a74a01c721?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 12,
      name: 'Handloom Cotton Festival Sarong Set',
      slug: 'handloom-cotton-festival-sarong-set',
      description:
        'Two-piece junior festive set with pure cotton embroidered sarong and matching mandarin collar top.',
      price: 3400.0,
      category: 'Kids',
      categoryId: 31,
      brand: 'Dickwella Junior',
      material: 'Pure Handloom Cotton',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 13,
      name: 'Dumbara Handwoven Artisan Shawl',
      slug: 'dumbara-handwoven-artisan-shawl',
      description:
        'Intricately pattern-woven traditional Dumbara shawl, ideal as an evening stole or heirloom gift.',
      price: 4200.0,
      category: 'Accessories',
      categoryId: 42,
      brand: 'Dickwella Atelier',
      material: 'Handloom Cotton & Silk',
      isFinalSale: false,
      primaryImage:
        'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
    },
  ];

  for (const prod of artisanProducts) {
    const existing = await Product.findByPk(prod.id);
    if (!existing) {
      const created = await Product.create(prod);
      // Create sample variants
      if (ProductVariant) {
        await ProductVariant.create({
          productId: created.id,
          sku: `${(prod.slug || 'PRD').substring(0, 6).toUpperCase()}-OS`,
          size: prod.category === 'Women' ? 'Free Size' : 'M',
          color: 'Default',
          stockQuantity: 25,
          reservedQuantity: 0,
        }).catch(() => {});
      }
    } else {
      await existing.update(prod);
    }
  }

  console.log('Categories & Products successfully seeded!');
}

module.exports = seedCategoriesAndProducts;

if (require.main === module) {
  seedCategoriesAndProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
