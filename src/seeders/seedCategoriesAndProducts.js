/* eslint-disable */
const { Brand, Category, Product, ProductVariant, sequelize } = require('../models');

const ONE_SIZE_CATEGORIES = ['Accessories', 'Shawls & Bags'];
const FREE_SIZE_CATEGORIES = ['Women', 'Saree', 'Saris'];
const XL_SURCHARGE_LKR = 250;

/** Size matrix for a product: apparel S-XL (XL costs more), sarees free size, accessories one size. */
function variantSpecsFor(product) {
  const color = product.material && /batik/i.test(product.name) ? 'Indigo' : 'Natural';
  if (ONE_SIZE_CATEGORIES.includes(product.category)) {
    return [{ code: 'OS', size: 'One Size', color, stock: 15, surcharge: 0 }];
  }
  if (FREE_SIZE_CATEGORIES.includes(product.category) || /sar(ee|i)/i.test(product.name)) {
    return [{ code: 'FS', size: 'Free Size', color, stock: 12, surcharge: 0 }];
  }
  return [
    { code: 'S', size: 'S', color, stock: 8, surcharge: 0 },
    { code: 'M', size: 'M', color, stock: 12, surcharge: 0 },
    { code: 'L', size: 'L', color, stock: 10, surcharge: 0 },
    { code: 'XL', size: 'XL', color, stock: 2, surcharge: XL_SURCHARGE_LKR },
  ];
}

/** The category arrays use snake_case keys; the model attributes are camelCase. */
function toCategoryAttributes(cat) {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description || null,
    parentId: cat.parent_id ?? null,
    sortOrder: cat.sort_order ?? 0,
    isActive: cat.is_active ?? true,
  };
}

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
      await Category.create(toCategoryAttributes(cat));
    } else {
      await existing.update(toCategoryAttributes(cat));
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
      await Category.create(toCategoryAttributes(sub));
    } else {
      await existing.update(toCategoryAttributes(sub));
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
      await Product.create(prod);
    } else {
      await existing.update(prod);
    }
  }

  // Home page sections and brands (#173). Flags are only set when staff have chosen none yet,
  // so running the seed again never overwrites their choices.
  const demoBrands = [
    { name: 'Dickwella Atelier', tagline: 'Handloom and batik from our own looms', sortOrder: 1 },
    { name: 'Dickwella Junior', tagline: 'Festive wear for little ones', sortOrder: 2 },
    { name: 'Dickwella', tagline: 'Everyday cotton classics', sortOrder: 3 },
  ];
  for (const brand of demoBrands) {
    await Brand.findOrCreate({
      where: { name: brand.name },
      defaults: { ...brand, slug: brand.name.toLowerCase().replace(/\s+/g, '-') },
    });
  }
  if ((await Product.count({ where: { isNewArrival: true } })) === 0) {
    await Product.update({ isNewArrival: true }, { where: { id: [8, 9, 10, 11, 12, 13] } });
  }
  if ((await Product.count({ where: { isPopular: true } })) === 0) {
    await Product.update({ isPopular: true }, { where: { id: [6, 7, 9, 2, 11, 13] } });
  }

  // Every product needs at least one purchasable variant, including products from other
  // seeders. SKUs are derived from the product id, so they never collide.
  const allProducts = await Product.findAll();
  for (const product of allProducts) {
    for (const spec of variantSpecsFor(product)) {
      await ProductVariant.findOrCreate({
        where: { sku: `DFC-${product.id}-${spec.code}` },
        defaults: {
          productId: product.id,
          size: spec.size,
          color: spec.color,
          stockQuantity: spec.stock,
          reservedQuantity: 0,
          additionalPrice: spec.surcharge,
        },
      });
    }
  }

  // Ensure PostgreSQL primary key sequences match the max seeded IDs
  if (
    sequelize &&
    typeof sequelize.getDialect === 'function' &&
    sequelize.getDialect() === 'postgres'
  ) {
    await sequelize.query(
      "SELECT setval('categories_id_seq', COALESCE((SELECT MAX(id) FROM categories), 1))"
    );
    await sequelize.query(
      "SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 1))"
    );
    await sequelize.query(
      "SELECT setval('product_variants_id_seq', COALESCE((SELECT MAX(id) FROM product_variants), 1))"
    );
  }

  console.log('Categories & Products successfully seeded!');
}

module.exports = seedCategoriesAndProducts;
module.exports.variantSpecsFor = variantSpecsFor;
module.exports.toCategoryAttributes = toCategoryAttributes;
// Also a Sequelize seeder, so `npm run db:seed` runs it after the demo accounts. Re-running
// it is safe: categories and products are upserted and variants are found or created.
module.exports.up = () => seedCategoriesAndProducts();
module.exports.down = async () => {};

if (require.main === module) {
  seedCategoriesAndProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
