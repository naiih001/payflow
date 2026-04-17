# Payflow

Payflow is a NestJS backend for a combined commerce and SaaS platform. The current codebase includes the foundation for authentication, user management, authorization, configuration, and Prisma-backed persistence.

## What Is Here

- JWT-based authentication
- Role-based access control
- Prisma integration with PostgreSQL
- Typed environment configuration
- Seeded development users
- Unit and e2e test coverage for core flows

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```env
NODE_ENV=development
PORT=3000
API_PREFIX=api
JWT_SECRET=payflow-dev-secret
JWT_EXPIRES_IN=1h
DATABASE_URL=postgresql://payflow:payflow@localhost:5432/payflow?schema=public
```

3. Start PostgreSQL:

```bash
docker compose up -d db
```

4. Run migrations:

```bash
npx prisma migrate deploy
```

5. Start the API:

```bash
npm run start:dev
```

By default, the API is available at `http://localhost:3000/api`.

## Common Commands

```bash
npm run start:dev
npm run lint
npm test
npm run test:e2e
```

## Default Development Users

- Admin: `admin@payflow.dev` / `AdminPass123`
- Customer: `customer@payflow.dev` / `CustomerPass123`

## Documentation

The README is intentionally brief. Use the docs directory for deeper explanations:

- [Documentation Index](/home/ryth/projects/payflow/docs/README.md)
- [Getting Started](/home/ryth/projects/payflow/docs/getting-started.md)
- [API Overview](/home/ryth/projects/payflow/docs/api.md)
- [Architecture Notes](/home/ryth/projects/payflow/docs/architecture.md)

The existing high-level system design is also available in [ARCHITECTURE.md](/home/ryth/projects/payflow/ARCHITECTURE.md).
