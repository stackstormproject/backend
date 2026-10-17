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
5. `npm run dev` (works once the server entry point is added)

## Scripts

`npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`

Integration tests use `TEST_DATABASE_URL`, which must point to a dedicated PostgreSQL
database whose name ends in `_test`. If it is unset, the test configuration derives it
from `DATABASE_URL` only when that URL's database name ends in `_dev` (for example,
`stackstorm_dev` becomes `stackstorm_test`), or accepts the legacy exact database name
`testdb` used by CI. The integration setup runs migrations and truncates test tables,
so do not point it at a development or production database.
Run `npm run test:integration` before `npx jest --coverage` to apply those migrations.

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
