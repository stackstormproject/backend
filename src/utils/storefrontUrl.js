/** Base address of the customer storefront, for links in emails and payment returns. */
const storefrontUrl = () =>
  (
    process.env.FRONTEND_CUSTOMER_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');

module.exports = { storefrontUrl };
