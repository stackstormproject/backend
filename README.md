# backend

[![CI Pipeline](https://github.com/stackstormproject/backend/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/stackstormproject/backend/actions)
![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)

StackStorm backend: Node.js / Express REST API, business logic and PostgreSQL data layer for the Dickwella Fashion Corner e-commerce system.

Broader project: https://github.com/stackstormproject

## Tech stack

Node.js 20, Express 4, Sequelize 6, PostgreSQL 17, Redis 7, Jest and Supertest.

## Prerequisites

| Software       | Version                            |
| -------------- | ---------------------------------- |
| Node.js        | 20 LTS                             |
| npm            | 10 or newer                        |
| Docker Desktop | latest (runs PostgreSQL and Redis) |
| Git            | latest                             |

## Installation and run

1. `git clone https://github.com/stackstormproject/backend.git` and `cd backend`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the values
4. Start the databases from the infra repo: `docker compose up -d`
5. `npx sequelize-cli db:migrate` then `npm run db:seed`
6. `npm run dev` (API on http://localhost:5000/api/v1)

The seed creates two staff accounts, both with the password in `SEED_ADMIN_PASSWORD`:
`admin@stackstorm.lk` (super_admin) and `support@stackstorm.lk` (support_agent).

`npm run db:seed` is for an empty database. For a database created before Sprint 8, run
`npx sequelize-cli db:migrate`, then `node src/seeders/seedCategoriesAndProducts.js`
(categories, products and sizes; safe to repeat), then restart the API.

Uploaded product images are saved in `uploads/` and served under `/api/v1/media` unless
`STORAGE_DRIVER=s3` (or real AWS keys) is set.

## Payments

Checkout sends the shopper to Stripe Checkout and Stripe sends them back to
`FRONTEND_URL/checkout/complete`, where the storefront asks `POST /payments/confirm-session` to
verify the payment. Set `STRIPE_SECRET_KEY` (test keys work) and `FRONTEND_URL`. Without a
Stripe key, outside production, the storefront's labelled test gateway is used instead.

## Password reset

`POST /api/v1/auth/forgot-password` with `{ email }` always answers 202 with the same message,
so it never shows whether an email has an account. For a customer it stores a hash of a
one-time token that expires after 60 minutes and emails a link to
`FRONTEND_URL/reset-password?token=...`. `POST /api/v1/auth/reset-password` with
`{ token, password }` sets the new password, ends every signed-in session and lifts a sign-in
lock. Both are limited to 5 requests an hour per address.

Email goes out through any SMTP server (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`); for Gmail use `smtp.gmail.com`, port 465 and an app password. Without
`SMTP_HOST` nothing is sent: the email is written to the backend log and, outside production,
the response includes `dev_reset_url` so the storefront can show the link.

## Shop sections and brands

`GET /products?section=new_arrivals|popular` lists the products staff marked for the home page
(`is_new_arrival`, `is_popular` on the product), and `GET /products?brand=<slug or name>` one
brand's products. `GET /brands` lists featured brands that have products on sale.

## Admin API

All routes are under `/api/v1/admin` and need a staff access token
(`POST /auth/admin/login`). Managers are `super_admin` and `admin`; support agents only reach
the support routes.

| Area      | Routes                                                                                        | Roles     |
| --------- | --------------------------------------------------------------------------------------------- | --------- |
| Analytics | `GET analytics`, `GET analytics/sales-trend?days=`                                            | Managers  |
| Orders    | `GET orders`, `GET orders/:id`, `GET orders/:id/invoice`, `PATCH orders/:id/status`           | Managers  |
| Products  | `GET/POST products`, `GET/PUT/DELETE products/:id`, `POST/PATCH/DELETE products/:id/variants` | Managers  |
| Brands    | `GET/POST brands`, `PUT/DELETE brands/:id`                                                    | Managers  |
| Stock     | `GET inventory`, `POST inventory/:variantId/adjust`, `GET inventory/:variantId/logs`          | Managers  |
| Returns   | `GET returns`, `GET returns/:id`, `POST returns/:id/approve\|reject\|receive`                 | Managers  |
| Customers | `GET customers`, `GET customers/:id`, `POST customers/:id/loyalty-adjustments`                | Managers  |
| Support   | `GET support/sessions`, `PATCH support/sessions/:id/status`                                   | All staff |

Socket.IO: staff sockets authenticate with the access token (`auth.token`); agent status
comes from the token's role only.

## Scripts

`npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`

Integration tests use `TEST_DATABASE_URL` when set; otherwise, they derive a separate
database ending in `_test` from a `DATABASE_URL` ending in `_dev`. The legacy database
name `testdb` is also accepted. Migrations and test cleanup run against this database,
so do not configure it to point to a development or production database.

## Branches and pull requests

- Branches: `main`, `develop`, `feature/<issue>-<slug>`, `fix/<issue>-<slug>`
- Open PRs against `develop`. CI must pass and one teammate must approve
- Never commit secrets. `.env` is git-ignored

## CI/CD

The pipeline is defined in the infra repo (`backend-ci.yml`) and called from `.github/workflows/ci.yml`.

## Deployed application

Staging URL: to be added when hosting is configured.

## Related repositories

frontend, infra (Docker and shared CI/CD), documents (SRS, SDS, ADRs).
