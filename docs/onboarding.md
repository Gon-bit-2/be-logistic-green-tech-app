# Backend onboarding

Last synced with code: 2026-05-05.

## Tổng quan

Backend là NestJS 11 service cho Logistic Green Tech. Service expose REST API, Socket.IO tracking namespace, BullMQ workers, Prisma/PostgreSQL access, Redis cache, Stripe webhook, Cloudinary upload, Google OAuth, Resend email và Goong Maps integration.

Làm việc trong thư mục:

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

## Cấu trúc thư mục

```text
backend/
├── docs/                 Tài liệu backend
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

## Biến môi trường

`src/config/config.ts` yêu cầu file `.env` tồn tại và validate khi app boot. Nếu thiếu key, process dừng ngay.

Bắt buộc:

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

- `CORS_ORIGINS` là comma-separated. Nếu không set, default là `http://localhost:3000`.
- `REDIS_URL` chỉ override cache store URL; BullMQ vẫn đọc `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`.
- `STRIPE_WEBHOOK_SECRET` optional trong config nhưng webhook verify cần secret khi chạy thật.
- Không commit giá trị thật của `.env`.

## Chạy local

1. Cài dependency:

```bash
npm install
```

2. Tạo Prisma client:

```bash
npx prisma generate
```

3. Apply migration:

```bash
npx prisma migrate deploy
```

4. Seed/đồng bộ permission route:

```bash
npm run p
```

5. Chạy dev server:

```bash
npm run start:dev
```

Port lấy từ `process.env.PORT`, sau đó `envConfig.PORT`, nếu không có thì `3000`.

## Scripts

| Command | Mục đích |
| --- | --- |
| `npm run start:dev` | Chạy Nest watch mode. |
| `npm run build` | Build Nest app. |
| `npm run lint` | ESLint auto fix cho `src`, `apps`, `libs`, `test`. |
| `npm run test` | Jest unit theo config trong `package.json`. |
| `npm run test:unit` | Unit tests `src/**/*.spec.ts` với `--runInBand`. |
| `npm run test:api` | API specs `test/*.api-spec.ts`. |
| `npm run test:e2e` | E2E specs `test/*.e2e-spec.ts`. |
| `npm run test:full` | Unit + API + E2E. |
| `npm run p` | Chạy `inittalScript/create-permission.ts`. |
| `npm run backfill:order-dimensions` | Backfill kích thước/volume/weight cho order. |

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

1. `main.ts` tạo app với `{ rawBody: true }` để Stripe webhook verify signature.
2. `helmet()` và CORS được bật trước khi app listen.
3. `ZodValidationPipe` validate input; `ZodSerializerInterceptor` serialize response DTO có decorator.
4. `RequestIdMiddleware` gắn `x-request-id`.
5. `LoggingMiddleware` log duration, status, user id, body size và slow flag.
6. Global guards chạy theo thứ tự throttler, app access: authentication, permission, roles, resource access.
7. `AllExceptionsFilter` chuẩn hóa error envelope.

## Auth và permission

- Default auth của endpoint là Bearer token. Dùng `@isPublic()` nếu route public.
- Access token payload được đọc bằng `@ActiveUser()`.
- Permission check dựa trên `roleId`, normalized path và HTTP method. Khi thêm endpoint mới, chạy lại `npm run p`.
- `RolesGuard` check `@Roles(...)`; `ADMIN` bypass role restriction.
- `ResourceAccessGuard` cần thêm `@ResourceAccess` cho resource owner/hub scope.

Khi thêm API mới:

1. Tạo schema trong `model/*.model.ts`.
2. Tạo DTO trong `dto/*.dto.ts` bằng `createZodDto`.
3. Controller chỉ parse request và gọi service.
4. Business logic nằm trong service; query phức tạp nằm trong repository/helper.
5. Nếu endpoint cần role, thêm `@Roles`.
6. Nếu endpoint thao tác resource riêng, thêm `@ResourceAccess`.
7. Chạy `npm run p` để sync permission.
8. Cập nhật `docs/api-reference.md` và tests liên quan.

## Quy ước code

- Controller mỏng; service chứa nghiệp vụ; repository chứa Prisma query phức tạp.
- List endpoint trả summary nhẹ; detail endpoint mới trả nested data nặng.
- Dùng transaction khi cập nhật nhiều bảng trong cùng nghiệp vụ.
- Lỗi nghiệp vụ nên dùng machine code dạng `Error.Domain.Reason` nếu frontend cần map ổn định.
- Không log token, password, OTP, Stripe secret, Cloudinary secret, API key.
- Chỉ thêm comment cho ràng buộc nghiệp vụ khó đọc hoặc logic vận hành không hiển nhiên.

## Checklist module orders/trips/tracking

1. Xác định actor: `ADMIN`, `WAREHOUSE_STAFF`, `DRIVER`, `CUSTOMER`.
2. Kiểm tra owner scope, driver scope hoặc hub scope trước khi update.
3. Với thay đổi status, xem `OrderStateService` và `VALID_STATUS_TRANSITIONS`.
4. Đơn `STRIPE` cần thanh toán thành công trước khi đưa vào vận chuyển; đơn `COD` có thể dispatch và settle khi giao.
5. POD bắt buộc khi chuyển order sang `DELIVERED`.
6. Dùng transaction khi tạo trip/stops/order status/tracking events.
7. Thêm unit test cho role, state hợp lệ, state lỗi và permission scope.

## Queue, cache, realtime

- BullMQ dùng Redis cho trips auto-dispatch và green-tech emission processor.
- Cache global dùng Redis Keyv, default TTL 60 giây.
- Role permission cache key `roleId:<id>` có TTL 1 giờ.
- Tracking WebSocket namespace `/tracking`, auth token nằm trong `socket.handshake.auth.token`.
- Tracking access cache TTL default 15 giây để giảm query khi dashboard join nhiều trip.

## Troubleshooting

- App báo thiếu env: kiểm tra file `.env` trong `backend/`.
- Frontend bị CORS: kiểm tra `CORS_ORIGINS`.
- 401 `Error.MissingAccessToken`/`Error.InvalidAccessToken`: kiểm tra header Bearer và token expiry.
- 403 `Error.Forbidden`: chạy `npm run p`, kiểm tra role permission path/method.
- 403 `Error.PermissionDenied.NotYourHub` hoặc `NotResourceOwner`: kiểm tra `hubId`, owner field và role payload.
- Stripe webhook fail signature: đảm bảo route nhận raw body và header `stripe-signature`.
- OSRM fail route optimization: backend tự fallback Haversine; kiểm tra `fallbackUsed` trong response.



