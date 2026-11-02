const { buildInvoicePdf } = require('../services/invoice.service');

/** Sends an order view as a PDF attachment named after its invoice number (#174). */
const sendInvoice = async (res, order) => {
  const pdf = await buildInvoicePdf(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${order.invoice_number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(pdf);
};

module.exports = { sendInvoice };
