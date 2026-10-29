# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Admin APIs for the operations console: order search, detail and status rules (#133);
  stock list, logged adjustments and history (#135); product and variant management with
  archiving (#136); return review, receiving, refunds and exchanges (#137); customer records
  and audited loyalty adjustments (#138)
- Support-agent account in the demo seed (#140)
- Product photos: a main image and up to three extra images, uploaded from the admin console;
  without S3 they are stored on the backend's disk and served under `/api/v1/media` (#172)
- Home page sections chosen by staff (new arrivals, popular) and brands with logos for
  "Our brands"; products can be listed by section or brand (#173)
- PDF invoice for paid orders: `GET /orders/:id/invoice` for the customer (or guest token)
  and `GET /admin/orders/:id/invoice` for managers (#174)
- Hosted payment page: `POST /payments/checkout-session` sends the shopper to Stripe Checkout
  (or the storefront's test gateway without a Stripe key) and `POST /payments/confirm-session`
  verifies the session when they come back; the webhook also accepts
  `checkout.session.completed` (#180)
- Admin order list rows include `allowed_statuses`, so staff can change a status from the list
  (#181)
- Password reset: `POST /auth/forgot-password` emails a one-hour, single-use link (SMTP, or
  the log and `dev_reset_url` in development) and `POST /auth/reset-password` sets the new
  password and signs out every session (#185)
- Search suggestions `GET /products/suggest?q=` (products, categories and brands as you type)
  and filter options `GET /products/facets` (in-stock colours and sizes); full search also
  matches the brand and treats `%` and `_` literally (#188)
- Profile picture: `POST /users/me/avatar` (field `avatar`, JPEG/PNG/WebP up to 5 MB) and
  `DELETE /users/me/avatar`; shopping preferences `GET`/`PATCH /users/me/preferences` (order
  emails, sale and back-in-stock alerts, newsletter, push, preferred payment and size); both
  appear on `GET /users/me`. Migration adds `customers.avatar_url` and `customers.preferences`
  (#189)
- Saved cards: signed-in shoppers can tick "save" on Stripe Checkout (each customer gets a
  Stripe customer) or on the test gateway (`save_card: true`); `GET /users/me/payment-methods`,
  `PATCH .../:id/default` and `DELETE .../:id` (also detached at Stripe). Only brand, last four
  digits and expiry are stored. Migration adds `payment_methods` and
  `customers.stripe_customer_id` (#190)
 feature/195-hero-banners
- Hero banners: the three home page banners are managed from admin (`GET`/`PUT /admin/banners`,
  `DELETE /admin/banners/:slot`) with a title, image, and an optional button that links
  anywhere in the shop; `GET /banners` lists the active ones for the storefront. Migration
  creates `banners` (#195)

- Sale pricing: admin can put a product on sale with a discount percentage (1-90); the sale
  price is shown everywhere the product appears, products can be listed by `section=sale`, and
  the home page gets a "Sale" section alongside new arrivals and popular. Migration adds
  `products.discount_percentage` (#194)
 develop

### Changed

- Admin routes follow the role matrix: managers for catalogue, orders, stock, returns and
  customers; all staff for support (#132)
- Revenue analytics count paid orders only and aggregate in SQL (#134)
- Support sessions name the agent who wrote each message and mark virtual-assistant
  messages as `bot` (#156)

### Fixed

- `npm run db:seed` stopped before creating categories and products on a new database, so
  the shop showed none; the catalogue and sample-order scripts now run as seeders (#171)

### Security

- Removed the `mock-admin-token` backdoor (#122)
- Chat agent identity comes from the verified JWT only; customers can no longer join the
  agent channel or other customers' sessions (#139)
- Exchanges are limited to another size or colour of the same product (#155)

### Added

- Forgot and reset password
- Added backend README with install steps and badges (#4)

- Authentication and authorisation middleware

- Added `refresh_tokens` table and login lockout columns (`failed_login_attempts`, `locked_until`) for admins and customers

### Added

- Admin login
- Rate limiters
- Development seed data
- Database migrations for 22 tables with the Issues Report corrections
- Sequelize CLI and database configuration
- CI/CD pipeline linked to the shared workflow in infra
- Backend project initialised with npm, dependencies and folder structure
- ESLint (Airbnb) and Prettier configuration
- `.env.example` environment variable template
- Jest configuration and first test
- Winston logger with PII redaction and request logging
