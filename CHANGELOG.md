# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Admin APIs for the operations console: order search, detail and status rules (#133);
  stock list, logged adjustments and history (#135); product and variant management with
  archiving (#136); return review, receiving, refunds and exchanges (#137); customer records
  and audited loyalty adjustments (#138)
- Support-agent account in the demo seed (#140)

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
