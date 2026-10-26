/* eslint-disable */
const { Order, OrderItem, ProductVariant, Product, Customer } = require('../models');

async function seedSampleOrders() {
  const existingCount = await Order.count();
  if (existingCount > 0) {
    console.log(`Orders already present (${existingCount} found). Skipping seeding.`);
    return;
  }

  const customers = await Customer.findAll();
  const variants = await ProductVariant.findAll({ include: [{ model: Product, as: 'product' }] });

  if (!customers.length || !variants.length) {
    console.log('Customers or variants missing. Please seed categories and customers first.');
    return;
  }

  const now = new Date();
  const sampleData = [
    {
      customerIndex: 0,
      daysAgo: 1,
      status: 'delivered',
      address: '45 Beach Road, Dickwella, Matara',
      items: [
        { variantIndex: 0, qty: 1 },
        { variantIndex: 1, qty: 1 },
      ],
    },
    {
      customerIndex: 1,
      daysAgo: 2,
      status: 'shipped',
      address: '12 Kandy Road, Colombo 07',
      items: [{ variantIndex: 2, qty: 1 }],
    },
    {
      customerIndex: 2,
      daysAgo: 3,
      status: 'processing',
      address: '78 Temple Road, Galle',
      items: [{ variantIndex: 3, qty: 2 }],
    },
    {
      customerIndex: 3,
      daysAgo: 4,
      status: 'confirmed',
      address: '23 Galle Road, Wellawatte',
      items: [{ variantIndex: 4, qty: 1 }],
    },
    {
      customerIndex: 0,
      daysAgo: 7,
      status: 'delivered',
      address: '45 Beach Road, Dickwella, Matara',
      items: [{ variantIndex: 5, qty: 3 }],
    },
    {
      customerIndex: 1,
      daysAgo: 10,
      status: 'delivered',
      address: '12 Kandy Road, Colombo 07',
      items: [
        { variantIndex: 6, qty: 2 },
        { variantIndex: 0, qty: 1 },
      ],
    },
    {
      customerIndex: 2,
      daysAgo: 14,
      status: 'delivered',
      address: '78 Temple Road, Galle',
      items: [
        { variantIndex: 1, qty: 1 },
        { variantIndex: 3, qty: 1 },
      ],
    },
    {
      customerIndex: 3,
      daysAgo: 18,
      status: 'delivered',
      address: '23 Galle Road, Wellawatte',
      items: [
        { variantIndex: 2, qty: 1 },
        { variantIndex: 4, qty: 1 },
      ],
    },
    {
      customerIndex: 0,
      daysAgo: 22,
      status: 'delivered',
      address: '45 Beach Road, Dickwella, Matara',
      items: [{ variantIndex: 0, qty: 2 }],
    },
    {
      customerIndex: 1,
      daysAgo: 27,
      status: 'delivered',
      address: '12 Kandy Road, Colombo 07',
      items: [
        { variantIndex: 5, qty: 1 },
        { variantIndex: 6, qty: 1 },
      ],
    },
  ];

  console.log('Seeding sample orders into PostgreSQL...');

  for (const s of sampleData) {
    const cust = customers[s.customerIndex % customers.length];
    const orderDate = new Date(now.getTime() - s.daysAgo * 24 * 60 * 60 * 1000);

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of s.items) {
      const v = variants[item.variantIndex % variants.length];
      const unitPrice = Number(v.product?.price || 4500) + Number(v.additionalPrice || 0);
      const subtotal = unitPrice * item.qty;
      totalAmount += subtotal;

      orderItemsData.push({
        productVariantId: v.id,
        quantity: item.qty,
        unitPrice,
        subtotal,
      });
    }

    const order = await Order.create({
      customerId: cust.id,
      orderDate,
      status: s.status,
      shippingAddress: s.address,
      billingAddress: s.address,
      shippingCost: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount,
    });

    for (const oi of orderItemsData) {
      await OrderItem.create({
        orderId: order.id,
        ...oi,
      });
    }
  }

  console.log(`Successfully seeded ${sampleData.length} sample orders!`);
}

if (require.main === module) {
  seedSampleOrders()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Order seeding failed:', err);
      process.exit(1);
    });
}

module.exports = seedSampleOrders;
