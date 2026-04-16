# Payflow

Payflow is a NestJS backend for a combined commerce and SaaS product. The current codebase covers the core platform pieces needed to grow into that shape: JWT authentication, role-based access control, Prisma-backed users, typed configuration, and the initial application wiring.

## Current Features

- Health endpoint at `GET /`
- Authentication endpoints at `POST /auth/register`, `POST /auth/login`, and `GET /auth/me`
- User endpoints at `GET /users/me` and `GET /users/admin`
- JWT auth guard with opt-out support for public routes
- Role guard for admin-only access
- Prisma user persistence with default seed users on startup

## Stack

- NestJS 11
- Prisma with PostgreSQL
- Passport JWT
- `bcrypt` password hashing
- Jest for unit and app-level tests

## Requirements

- Node.js 20+
- npm
- PostgreSQL 16+ or Docker

## Environment Variables

Create a `.env` file with:

```env
NODE_ENV=development
PORT=3000
API_PREFIX=api
JWT_SECRET=payflow-dev-secret
JWT_EXPIRES_IN=1h
DATABASE_URL=postgresql://payflow:payflow@localhost:5432/payflow?schema=public
```

Required values are validated at startup in [src/config/configuration.ts](/home/ryth/projects/payflow/src/config/configuration.ts).

## Local Setup

Install dependencies:

```bash
npm install
```

Start PostgreSQL with Docker:

```bash
docker compose up -d db
```

Apply Prisma migrations:

```bash
npx prisma migrate deploy
```

Start the API in development mode:

```bash
npm run start:dev
```

The app listens on `http://localhost:3000` and applies the global prefix from `API_PREFIX`, so the default API base is `http://localhost:3000/api`.

## Seed Users

`UsersService` seeds two accounts on module startup if they do not already exist:

- Admin: `admin@payflow.dev` / `AdminPass123`
- Customer: `customer@payflow.dev` / `CustomerPass123`

## Scripts

```bash
# start
npm run start
npm run start:dev
npm run start:prod

# quality
npm run lint

# tests
npm test
npm run test:e2e
npm run test:cov
```

## Testing

The project currently uses isolated Jest coverage for core behavior:

- `AuthService` registration, login, and profile lookup
- `UsersService` lookup, list, and seed behavior
- `JwtStrategy`
- `JwtAuthGuard`
- `RolesGuard`
- configuration validation
- controller wiring in the app-level test module

Run the full test suite:

```bash
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

## Docker

The provided [docker-compose.yml](/home/ryth/projects/payflow/docker-compose.yml) starts:

- `db`: PostgreSQL 16
- `app`: the NestJS service

Start everything:

```bash
docker compose up --build
```

## Project Notes

- The root health response comes from [src/app.controller.ts](/home/ryth/projects/payflow/src/app.controller.ts).
- Prisma schema lives in [prisma/schema.prisma](/home/ryth/projects/payflow/prisma/schema.prisma).
- High-level architectural intent is documented in [ARCHITECTURE.md](/home/ryth/projects/payflow/ARCHITECTURE.md).
