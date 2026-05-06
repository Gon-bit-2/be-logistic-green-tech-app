# Logistic Green Tech Backend

Backend chinh cua he thong logistics xanh, xay bang NestJS va Prisma. Service nay xu ly xac thuc, don hang, chuyen xe, dispatch, tracking, thanh toan, thong bao, emission, role request, upload, maps va wallet.

## Stack

- NestJS 11 + TypeScript
- Prisma 7 + PostgreSQL
- Zod / `nestjs-zod`
- Redis cache + BullMQ
- Socket.IO
- Stripe
- Cloudinary
- Google OAuth2
- Resend
- Goong Maps
- OSRM route optimization with Haversine fallback

## Cau truc

```text
backend/
├── docs/                 Tai lieu API, onboarding, performance/error
├── emails/               Email templates
├── generated/            Prisma generated client
├── inittalScript/        Permission/admin/backfill scripts
├── prisma/               Schema, migrations, seed
├── src/
│   ├── common/           Guard, decorator, filter, middleware, constants, shared services
│   ├── config/           Env validation
│   ├── database/         Prisma service
│   └── modules/          Feature modules
└── test/                 API/e2e specs
```

## Module API

- `auth`: OTP, register/login, refresh/logout, Google OAuth, profile, address book.
- `orders`: quote, create/list/detail, status, cancel/delete.
- `payments`: Stripe PaymentIntent/webhook, COD confirm, payment status.
- `trips`: dispatch board/preview/approve, manual trip, assignment request, auto-dispatch, route optimization.
- `tracking-events`: internal/public tracking timeline, POD, order status events.
- `tracking` Socket.IO namespace: realtime trip location.
- `notifications`: inbox, unread count, mark read.
- `analytics`: admin dashboard metrics.
- `vehicles`, `hubs`, `maps`, `upload`, `wallet`, `green-tech`, `gamification`, `language`, `role-requests`.

## Chay local

Lam viec trong thu muc `backend`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run p
npm run start:dev
```

Port lay tu `PORT`, neu khong co thi `3000`. Backend khong dung global prefix `/api`.

## Bien moi truong

File `.env` bat buoc ton tai trong `backend/`. `src/config/config.ts` validate khi app boot va dung process neu thieu key.

Nhom bien chinh:

- Database: `DATABASE_URL`
- JWT/Auth: `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `API_KEY_SECRET`
- Admin seed: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE_NUMBER`
- OTP/Mail: `OTP_EXPIRES_IN`, `RESEND_API_KEY`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_REDIRECT_URI`
- Redis/BullMQ: `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`; cache co the dung `REDIS_URL`
- CORS: `CORS_ORIGINS` comma-separated
- Payment: `PAYMENT_API_KEY`, `STRIPE_SECRET_KEY`, optional `STRIPE_WEBHOOK_SECRET`
- Upload: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Maps/routing: `GOONG_MAPS_API_KEY`, `GOONG_BASE_URL`, optional `OSRM_BASE_URL`
- Runtime: optional `PORT`, `NODE_ENV`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `PRISMA_QUERY_LOG`, `SLOW_REQUEST_MS`, `TRACKING_ACCESS_CACHE_TTL_MS`

Khong commit gia tri that cua `.env`.

## Scripts

```bash
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:api
npm run test:e2e
npm run test:full
npm run p
npm run backfill:order-dimensions
```

## Testing

- `npm run test:unit`: unit tests trong `src`.
- `npm run test:api`: API specs trong `test/*.api-spec.ts`.
- `npm run test:e2e`: E2E specs trong `test/*.e2e-spec.ts`.
- `npm run test:full`: unit + API + E2E.

## Ghi chu van hanh

- `main.ts` bat `helmet()`, CORS va Zod validation/serialization.
- `NestFactory.create(AppModule, { rawBody: true })` de Stripe webhook verify signature.
- Default auth la Bearer token; route public dung `@isPublic()`.
- Permission check theo `role + path + method`; sau khi them/sua route can chay `npm run p`.
- `ResourceAccessGuard` bao ve owner-level va hub-level access.
- Request log co `x-request-id`; error response co envelope on dinh.
- Don `STRIPE` can payment thanh cong truoc khi van chuyen; don `COD` dispatch binh thuong va settle khi driver giao hang.
- POD bat buoc khi order sang `DELIVERED`.
- Route optimization dung OSRM, tu fallback Haversine khi OSRM loi.

## Tai lieu

- [docs/api-reference.md](docs/api-reference.md)
- [docs/onboarding.md](docs/onboarding.md)
- [docs/performance-and-errors.md](docs/performance-and-errors.md)
