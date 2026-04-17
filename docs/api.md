# API Overview

## Base URL

With the default environment:

```text
http://localhost:3000/api
```

## Endpoints

### Health

- `GET /`

### Authentication

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Users

- `GET /users/me`
- `GET /users/admin`

## Access Rules

- Public routes can opt out of JWT protection
- Authenticated routes require a valid bearer token
- Admin routes require the admin role

## Notes

- JWT behavior is implemented in [src/auth](/home/ryth/projects/payflow/src/auth)
- Route protection lives in [src/common/guards](/home/ryth/projects/payflow/src/common/guards)
- Response shaping and error handling live in [src/common](/home/ryth/projects/payflow/src/common)
