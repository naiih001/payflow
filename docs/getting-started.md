# Getting Started

## Requirements

- Node.js 20+
- npm
- PostgreSQL 16+ or Docker

## Environment

Create a `.env` file in the project root:

```env
NODE_ENV=development
PORT=3000
API_PREFIX=api
JWT_SECRET=payflow-dev-secret
JWT_EXPIRES_IN=1h
DATABASE_URL=postgresql://payflow:payflow@localhost:5432/payflow?schema=public
```

Environment values are validated in [src/config/configuration.ts](/home/ryth/projects/payflow/src/config/configuration.ts).

## Local Setup

Install dependencies:

```bash
npm install
```

Start the database:

```bash
docker compose up -d db
```

Apply migrations:

```bash
npx prisma migrate deploy
```

Start the application:

```bash
npm run start:dev
```

The API base URL is `http://localhost:3000/api` when using the default environment.

## Testing

Run unit tests:

```bash
npm test -- --runInBand
```

Run end-to-end tests:

```bash
npm run test:e2e -- --runInBand
```

## Seed Users

The app seeds these development users on startup if they do not already exist:

- Admin: `admin@payflow.dev` / `AdminPass123`
- Customer: `customer@payflow.dev` / `CustomerPass123`
