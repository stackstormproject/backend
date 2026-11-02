const { buildInvoicePdf } = require('../../../src/services/invoice.service');

// Refs #174: the invoice renders for every order shape the shop produces.
const line = (overrides = {}) => ({
  product_title: 'Signature Linen Batik Shirt',
  size: 'M',
  color: 'Indigo',
  sku: 'DFC-6-M',
  quantity: 1,
  unit_price: 4500,
  subtotal: 4500,
  ...overrides,
});
const order = (overrides = {}) => ({
  id: 12,
  invoice_number: 'DFC-2026-0012',
  status: 'confirmed',
  order_date: '2026-10-27T05:00:00Z',
  customer: { name: 'Alice Perera', email: 'alice@example.com' },
  shipping_option: 'standard',
  shipping_address: { line1: '12 Main Street', city: 'Dickwella', postal_code: '81200' },
  billing_address: null,
  shipping_cost: 0,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 4500,
  items: [line()],
  ...overrides,
});
const isPdf = (buffer) => buffer.subarray(0, 5).toString() === '%PDF-';

describe('invoiceService.buildInvoicePdf', () => {
  it('should refuse an unpaid order', () => {
    expect(() => buildInvoicePdf(order({ status: 'payment_pending' }))).toThrow(
      /once the order is paid/
    );
  });

  it('should render a paid delivery order', async () => {
    expect(isPdf(await buildInvoicePdf(order()))).toBe(true);
  });

  it('should render collection, guests, discounts, tax and tracking', async () => {
    const pdf = await buildInvoicePdf(
      order({
        status: 'shipped',
        shipping_option: 'pickup',
        customer: null,
        guest_email: 'guest@example.com',
        shipping_cost: 350,
        discount_amount: 500,
        tax_amount: 120,
        tracking_number: 'RR123LK',
        billing_address: '45 Beach Road, Dickwella',
      })
    );
    expect(isPdf(pdf)).toBe(true);
  });

  it('should continue long orders on a second page', async () => {
    const items = Array.from({ length: 30 }, (_, i) => line({ sku: `SKU-${i}`, size: null }));
    const pdf = await buildInvoicePdf(order({ items, status: 'archived-status' }));
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g).length).toBeGreaterThan(1);
  });

  it('should render an order without lines or addresses', async () => {
    const pdf = await buildInvoicePdf(order({ items: undefined, shipping_address: null }));
    expect(isPdf(pdf)).toBe(true);
  });
});
