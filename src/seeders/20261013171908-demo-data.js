const bcrypt = require('bcrypt');

const WORK_FACTOR = 12;

module.exports = {
  async up(queryInterface) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
    if (!adminPassword || !customerPassword) {
      throw new Error('Set SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD in .env first');
    }
    const now = new Date();
    const adminHash = await bcrypt.hash(adminPassword, WORK_FACTOR);
    const customerHash = await bcrypt.hash(customerPassword, WORK_FACTOR);

    await queryInterface.bulkInsert('admins', [
      {
        email: 'admin@stackstorm.lk',
        name: 'Super Admin',
        hashed_password: adminHash,
        role: 'super_admin',
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert('customers', [
      {
        email: 'alice@example.com',
        name: 'Alice Silva',
        hashed_password: customerHash,
        loyalty_tier: 'silver',
        loyalty_points: 0,
        created_at: now,
        updated_at: now,
      },
      {
        email: 'bob@example.com',
        name: 'Bob Perera',
        hashed_password: customerHash,
        loyalty_tier: 'gold',
        loyalty_points: 1500,
        created_at: now,
        updated_at: now,
      },
      {
        email: 'carol@example.com',
        name: 'Carol Fernando',
        hashed_password: customerHash,
        loyalty_tier: 'silver',
        loyalty_points: 200,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert('products', [
      {
        name: 'Classic White Shirt',
        description: 'Premium cotton dress shirt.',
        price: 2500.0,
        category: 'Shirts',
        brand: 'Dickwella',
        is_final_sale: false,
        primary_image:
          'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Slim Fit Chinos',
        description: 'Modern slim fit trousers.',
        price: 3800.0,
        category: 'Pants',
        brand: 'Dickwella',
        is_final_sale: false,
        primary_image:
          'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80',
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Linen Summer Shirt',
        description: 'Light linen shirt.',
        price: 2900.0,
        category: 'Shirts',
        brand: 'Dickwella',
        is_final_sale: false,
        primary_image:
          'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=800&q=80',
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Denim Jacket',
        description: 'Classic denim jacket.',
        price: 7200.0,
        category: 'Jackets',
        brand: 'Dickwella',
        is_final_sale: true,
        primary_image:
          'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=800&q=80',
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Cotton Polo T-Shirt',
        description: 'Soft cotton polo.',
        price: 1800.0,
        category: 'T-Shirts',
        brand: 'Dickwella',
        is_final_sale: false,
        primary_image:
          'https://images.unsplash.com/photo-1620012253295-c15c429f66bf?auto=format&fit=crop&w=800&q=80',
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('admins', null, {});
  },
};
