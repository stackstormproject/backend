# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]
- Added backend README with install steps and badges (#4)

- Authentication and authorisation middleware



- Added `refresh_tokens` table and login lockout columns (`failed_login_attempts`, `locked_until`) for admins and customers

### Added

- Development seed data
- Database migrations for 22 tables with the Issues Report corrections
- Sequelize CLI and database configuration
- CI/CD pipeline linked to the shared workflow in infra
- Backend project initialised with npm, dependencies and folder structure
- ESLint (Airbnb) and Prettier configuration
- `.env.example` environment variable template
- Jest configuration and first test
- Winston logger with PII redaction and request logging
