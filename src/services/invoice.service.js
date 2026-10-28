// ==============================================================================
// Downloadable PDF invoice for a paid order (#174).
// Built from the same order view the customer sees, so the numbers always match the site.
// ==============================================================================

const PDFDocument = require('pdfkit');
const ApiError = require('../utils/ApiError');

const SHOP = {
  name: 'Dickwella Fashion Corner',
  address: 'Main Street, Dickwella, Matara 81200, Sri Lanka',
  contact: 'Open daily, 9 am to 8 pm',
};
const NAVY = '#0f1d3a';
const GOLD = '#c99a2e';
const MUTED = '#5b6474';
const UNPAID = ['payment_pending'];

const money = (amount) =>
  `LKR ${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  });

const addressLines = (address) => {
  if (!address) return [];
  if (typeof address === 'string') return [address];
  return [
    address.name || [address.first_name, address.last_name].filter(Boolean).join(' '),
    address.address_line1 || address.line1,
    address.address_line2 || address.line2,
    [address.city, address.postal_code].filter(Boolean).join(' '),
    address.phone,
  ].filter(Boolean);
};

const STATUS_LABELS = {
  confirmed: 'Paid',
  processing: 'Paid - being prepared',
  shipped: 'Paid - shipped',
  delivered: 'Paid - delivered',
  cancelled: 'Cancelled',
};

/** Renders the invoice and resolves with the PDF bytes. */
const buildInvoicePdf = (order) => {
  if (UNPAID.includes(order.status)) {
    throw ApiError.conflict('An invoice is available once the order is paid');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: order.invoice_number } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // Header band
    doc.rect(0, 0, doc.page.width, 110).fill(NAVY);
    doc.rect(0, 110, doc.page.width, 4).fill(GOLD);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(SHOP.name, left, 36);
    doc.font('Helvetica').fontSize(9).fillColor('#d7deea').text(SHOP.address, left, 66);
    doc.text(SHOP.contact, left, 80);
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(GOLD)
      .text('INVOICE', left, 40, { width, align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#ffffff')
      .text(order.invoice_number, left, 66, { width, align: 'right' });

    // Order facts and addresses
    let y = 140;
    const customer = order.customer || {};
    const billTo = [
      ...new Set(
        [
          customer.name,
          customer.email || order.guest_email,
          ...addressLines(order.billing_address || order.shipping_address),
        ].filter(Boolean)
      ),
    ];
    const shipTo =
      order.shipping_option === 'pickup'
        ? ['Collect from the shop', 'Main Street, Dickwella']
        : addressLines(order.shipping_address);

    const block = (title, lines, x) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(title.toUpperCase(), x, y);
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      lines.forEach((line, i) => doc.text(line, x, y + 16 + i * 14, { width: width / 3 - 10 }));
    };
    block('Invoice date', [formatDate(order.order_date)], left);
    block('Status', [STATUS_LABELS[order.status] || order.status], left + width / 3);
    y += 46;
    block('Bill to', billTo, left);
    block('Ship to', shipTo, left + width / 3);
    block(
      'Order',
      [`Order #${order.id}`, order.tracking_number && `Tracking ${order.tracking_number}`].filter(
        Boolean
      ),
      left + (2 * width) / 3
    );
    y += 30 + Math.max(billTo.length, shipTo.length, 2) * 14;

    // Lines
    const cols = {
      item: left,
      qty: left + width * 0.58,
      price: left + width * 0.68,
      total: left + width * 0.84,
    };
    doc.rect(left, y, width, 22).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED);
    doc.text('ITEM', cols.item + 8, y + 7);
    doc.text('QTY', cols.qty, y + 7);
    doc.text('UNIT PRICE', cols.price, y + 7);
    doc.text('AMOUNT', cols.total, y + 7, { width: right - cols.total - 8, align: 'right' });
    y += 30;

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    (order.items || []).forEach((item) => {
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = 50;
      }
      const detail = [item.size, item.color, item.sku].filter(Boolean).join(' / ');
      doc
        .font('Helvetica-Bold')
        .text(item.product_title, cols.item + 8, y, { width: cols.qty - cols.item - 16 });
      const nameHeight = doc.heightOfString(item.product_title, {
        width: cols.qty - cols.item - 16,
      });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(detail, cols.item + 8, y + nameHeight + 2);
      doc.fontSize(10).fillColor('#111827');
      doc.text(String(item.quantity), cols.qty, y);
      doc.text(money(item.unit_price), cols.price, y);
      doc.text(money(item.subtotal), cols.total, y, {
        width: right - cols.total - 8,
        align: 'right',
      });
      y += Math.max(nameHeight + 16, 30);
      doc
        .moveTo(left, y - 6)
        .lineTo(right, y - 6)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
    });

    // Totals
    const subtotal = (order.items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const rows = [
      ['Subtotal', money(subtotal)],
      ['Delivery', order.shipping_cost ? money(order.shipping_cost) : 'Free'],
      ...(order.discount_amount ? [['Discount', `- ${money(order.discount_amount)}`]] : []),
      ...(order.tax_amount ? [['Tax', money(order.tax_amount)]] : []),
    ];
    y += 6;
    const labelX = left + width * 0.55;
    rows.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, labelX, y);
      doc
        .fillColor('#111827')
        .text(value, labelX, y, { width: right - labelX - 8, align: 'right' });
      y += 18;
    });
    doc.rect(labelX - 8, y, right - labelX + 8, 28).fill(NAVY);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#ffffff')
      .text('Total paid', labelX, y + 9);
    doc.fillColor(GOLD).text(money(order.total_amount), labelX, y + 9, {
      width: right - labelX - 8,
      align: 'right',
    });

    // Footer
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        'Prices in Sri Lankan rupees. Returns and exchanges within 30 days of delivery, except final-sale items. Thank you for shopping with us.',
        left,
        doc.page.height - 70,
        { width, align: 'center' }
      );

    doc.end();
  });
};

module.exports = { buildInvoicePdf };
