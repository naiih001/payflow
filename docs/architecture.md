# Architecture Notes

## Current Shape

The codebase is currently centered on a NestJS monolith with these active areas:

- application bootstrap
- configuration
- authentication
- users
- Prisma persistence
- shared guards, decorators, filters, and interceptors

## Important Locations

- App bootstrap: [src/main.ts](/home/ryth/projects/payflow/src/main.ts)
- Root module: [src/app.module.ts](/home/ryth/projects/payflow/src/app.module.ts)
- Auth module: [src/auth/auth.module.ts](/home/ryth/projects/payflow/src/auth/auth.module.ts)
- Users module: [src/users/users.module.ts](/home/ryth/projects/payflow/src/users/users.module.ts)
- Prisma schema: [prisma/schema.prisma](/home/ryth/projects/payflow/prisma/schema.prisma)

## Longer-Range Design

The broader commerce and SaaS target architecture is documented in [ARCHITECTURE.md](/home/ryth/projects/payflow/ARCHITECTURE.md). That file describes the intended modules and domain structure beyond what is currently implemented.
