# Backend onboarding

Last synced with code: 2026-05-05.

## Tong quan

Backend la NestJS 11 service cho Logistic Green Tech. Service expose REST API, Socket.IO tracking namespace, BullMQ workers, Prisma/PostgreSQL access, Redis cache, Stripe webhook, Cloudinary upload, Google OAuth, Resend email va Goong Maps integration.

Lam viec trong thu muc:

```bash
cd backend
```

## Stack

- NestJS 11, TypeScript 5
- Prisma 7 + PostgreSQL qua `@prisma/adapter-pg`
- Zod + `nestjs-zod` cho request/response DTO
- Redis + `@keyv/redis` cache + BullMQ queue
- Socket.IO namespace `/tracking`
- Stripe, Cloudinary, Google OAuth2, Resend, Goong Maps

## Cau truc thu muc

```text
backend/
├── docs/                 Tai lieu backend
├── emails/               React Email templates
├── generated/            Prisma client generated output
├── inittalScript/        Seed admin/permission/backfill scripts
├── prisma/               Schema, migrations, seed
├── src/
│   ├── common/           Guard, decorator, filter, middleware, constants, shared services
│   ├── config/           Env validation
│   ├── database/         Prisma bootstrap
│   └── modules/
│       ├── analytics
│       ├── auth
│       ├── green-tech
│       ├── hub
│       ├── language
│       ├── maps
│       ├── notification
│       ├── orders
│       ├── payment
│       ├── role
│       ├── tracking
│       ├── trips
│       ├── upload
│       ├── vehicle
│       └── wallet
└── test/                 API/e2e tests and helpers
```

## Bien moi truong

`src/config/config.ts` yeu cau file `.env` ton tai va validate khi app boot. Neu thieu key, process dung ngay.

Bat buoc:

```env
DATABASE_URL=
ACCESS_TOKEN_SECRET=
ACCESS_TOKEN_EXPIRES_IN=
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=
API_KEY_SECRET=
PAYMENT_API_KEY=
ADMIN_NAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
ADMIN_PHONE_NUMBER=
OTP_EXPIRES_IN=
RESEND_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_CLIENT_REDIRECT_URI=
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_HOST=
REDIS_PORT=
STRIPE_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOONG_MAPS_API_KEY=
GOONG_BASE_URL=
```

Optional:

```env
NODE_ENV=
PORT=
CORS_ORIGINS=http://localhost:3000,http://localhost:8386
REDIS_URL=
STRIPE_WEBHOOK_SECRET=
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT_MS=30000
PRISMA_QUERY_LOG=0
SLOW_REQUEST_MS=1000
TRACKING_ACCESS_CACHE_TTL_MS=15000
OSRM_BASE_URL=http://router.project-osrm.org
```

Notes:

- `CORS_ORIGINS` la comma-separated. Neu khong set, default la `http://localhost:3000`.
- `REDIS_URL` chi override cache store URL; BullMQ van doc `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`.
- `STRIPE_WEBHOOK_SECRET` optional trong config nhung webhook verify can secret khi chay that.
- Khong commit gia tri that cua `.env`.

## Chay local

1. Cai dependency:

```bash
npm install
```

2. Tao Prisma client:

```bash
npx prisma generate
```

3. Apply migration:

```bash
npx prisma migrate deploy
```

4. Seed/dong bo permission route:

```bash
npm run p
```

5. Chay dev server:

```bash
npm run start:dev
```

Port lay tu `process.env.PORT`, sau do `envConfig.PORT`, neu khong co thi `3000`.

## Scripts

| Command | Muc dich |
| --- | --- |
| `npm run start:dev` | Chay Nest watch mode. |
| `npm run build` | Build Nest app. |
| `npm run lint` | ESLint auto fix cho `src`, `apps`, `libs`, `test`. |
| `npm run test` | Jest unit theo config trong `package.json`. |
| `npm run test:unit` | Unit tests `src/**/*.spec.ts` voi `--runInBand`. |
| `npm run test:api` | API specs `test/*.api-spec.ts`. |
| `npm run test:e2e` | E2E specs `test/*.e2e-spec.ts`. |
| `npm run test:full` | Unit + API + E2E. |
| `npm run p` | Chay `inittalScript/create-permission.ts`. |
| `npm run backfill:order-dimensions` | Backfill kich thuoc/volume/weight cho order. |

## Module map

- `auth`: OTP, register/login, refresh/logout, Google OAuth, profile, address book.
- `orders`: quote, create/list/detail, status update, cancel/delete.
- `payment`: Stripe PaymentIntent, Stripe webhook, COD confirm, payment status.
- `trips`: manual trip, dispatch board/preview/approve, driver assignment request, auto-dispatch, route optimization, trip status.
- `tracking`: tracking timeline, public tracking, POD, WebSocket GPS.
- `notification`: inbox, unread count, mark read, event listener.
- `green-tech`: emission calculation, history, gamification.
- `maps`: Goong autocomplete/detail/geocode/directions.
- `hub`: hub CRUD, assign staff/driver.
- `vehicle`: vehicle CRUD.
- `role`: role request approval flow.
- `wallet`: driver COD wallet and reconciliation.
- `language`: language dictionary CRUD.
- `analytics`: admin dashboards.
- `upload`: Cloudinary image/POD uploads.

## Request lifecycle

1. `main.ts` tao app voi `{ rawBody: true }` de Stripe webhook verify signature.
2. `helmet()` va CORS duoc bat truoc khi app listen.
3. `ZodValidationPipe` validate input; `ZodSerializerInterceptor` serialize response DTO co decorator.
4. `RequestIdMiddleware` gan `x-request-id`.
5. `LoggingMiddleware` log duration, status, user id, body size va slow flag.
6. Global guards chay theo thu tu throttler, app access: authentication, permission, roles, resource access.
7. `AllExceptionsFilter` chuan hoa error envelope.

## Auth va permission

- Default auth cua endpoint la Bearer token. Dung `@isPublic()` neu route public.
- Access token payload duoc doc bang `@ActiveUser()`.
- Permission check dua tren `roleId`, normalized path va HTTP method. Khi them endpoint moi, chay lai `npm run p`.
- `RolesGuard` check `@Roles(...)`; `ADMIN` bypass role restriction.
- `ResourceAccessGuard` can them `@ResourceAccess` cho resource owner/hub scope.

Khi them API moi:

1. Tao schema trong `model/*.model.ts`.
2. Tao DTO trong `dto/*.dto.ts` bang `createZodDto`.
3. Controller chi parse request va goi service.
4. Business logic nam trong service; query phuc tap nam trong repository/helper.
5. Neu endpoint can role, them `@Roles`.
6. Neu endpoint thao tac resource rieng, them `@ResourceAccess`.
7. Chay `npm run p` de sync permission.
8. Cap nhat `docs/api-reference.md` va tests lien quan.

## Quy uoc code

- Controller mong; service chua nghiep vu; repository chua Prisma query phuc tap.
- List endpoint tra summary nhe; detail endpoint moi tra nested data nang.
- Dung transaction khi cap nhat nhieu bang trong cung nghiep vu.
- Loi nghiep vu nen dung machine code dang `Error.Domain.Reason` neu frontend can map on dinh.
- Khong log token, password, OTP, Stripe secret, Cloudinary secret, API key.
- Chi them comment cho rang buoc nghiep vu kho doc hoac logic van hanh khong hien nhien.

## Checklist module orders/trips/tracking

1. Xac dinh actor: `ADMIN`, `WAREHOUSE_STAFF`, `DRIVER`, `CUSTOMER`.
2. Kiem tra owner scope, driver scope hoac hub scope truoc khi update.
3. Voi thay doi status, xem `OrderStateService` va `VALID_STATUS_TRANSITIONS`.
4. Don `STRIPE` can thanh toan thanh cong truoc khi dua vao van chuyen; don `COD` co the dispatch va settle khi giao.
5. POD bat buoc khi chuyen order sang `DELIVERED`.
6. Dung transaction khi tao trip/stops/order status/tracking events.
7. Them unit test cho role, state hop le, state loi va permission scope.

## Queue, cache, realtime

- BullMQ dung Redis cho trips auto-dispatch va green-tech emission processor.
- Cache global dung Redis Keyv, default TTL 60 giay.
- Role permission cache key `roleId:<id>` co TTL 1 gio.
- Tracking WebSocket namespace `/tracking`, auth token nam trong `socket.handshake.auth.token`.
- Tracking access cache TTL default 15 giay de giam query khi dashboard join nhieu trip.

## Troubleshooting

- App bao thieu env: kiem tra file `.env` trong `backend/`.
- Frontend bi CORS: kiem tra `CORS_ORIGINS`.
- 401 `Error.MissingAccessToken`/`Error.InvalidAccessToken`: kiem tra header Bearer va token expiry.
- 403 `Error.Forbidden`: chay `npm run p`, kiem tra role permission path/method.
- 403 `Error.PermissionDenied.NotYourHub` hoac `NotResourceOwner`: kiem tra `hubId`, owner field va role payload.
- Stripe webhook fail signature: dam bao route nhan raw body va header `stripe-signature`.
- OSRM fail route optimization: backend tu fallback Haversine; kiem tra `fallbackUsed` trong response.
