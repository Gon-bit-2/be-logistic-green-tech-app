# Backend Test Report

Ngày cập nhật: `2026-04-19`

## 1. Mục tiêu đã thực hiện

- Ổn định toàn bộ test suite hiện có của backend NestJS.
- Bổ sung automation/API test cho các flow HTTP chính.
- Tách rõ các tầng chạy test:
  - `unit`
  - `api`
  - `e2e smoke`
- Chuẩn hóa script chạy full suite và lưu lại kết quả thực thi.

## 2. Thay đổi đã triển khai

### 2.1 Sửa các test đang fail

- Sửa `src/modules/trips/test/trips.service.spec.ts` để dùng đúng `TripsService` và `TripRepository`, đồng bộ với tên class thật.
- Sửa `src/main.spec.ts` để mock đầy đủ app methods mà `bootstrap()` đang gọi:
  - `useGlobalPipes`
  - `useGlobalInterceptors`
  - `get`
- Sửa `src/app.module.spec.ts` từ `Strips*` sang `Trips*`.
- Sửa `src/modules/tracking/test/tracking.service.spec.ts` để dùng enum và trạng thái đúng với implementation hiện tại.
- Sửa `test/jest-e2e.json` để resolve được alias `src/*` và file `tsx`.

### 2.2 Bổ sung test layers mới

- Thêm helper dựng app test HTTP dùng chung:
  - `test/helpers/create-http-test-app.ts`
- Thêm config riêng cho automation/API:
  - `test/jest-api.json`
- Thêm script:
  - `test:unit`
  - `test:api`
  - `test:e2e`
  - `test:full`

### 2.3 Thêm test cases mới

#### Unit

- `src/modules/analytics/test/analytics.service.spec.ts`

#### API automation

- `test/auth.api-spec.ts`
- `test/orders.api-spec.ts`
- `test/trips.api-spec.ts`
- `test/payment.api-spec.ts`
- `test/tracking.api-spec.ts`
- `test/analytics.api-spec.ts`

#### E2E smoke

- `test/app.e2e-spec.ts`

## 3. Cách chạy

```bash
npm run test:unit
npm run test:api
npm run test:e2e
npm run test:full
npm run test:cov -- --runInBand
```

## 4. Kết quả thực thi

### 4.1 Full suite

Lệnh đã chạy:

```bash
npm run test:full
```

Kết quả:

- `unit`: `15` suites, `110` tests, pass toàn bộ
- `api`: `6` suites, `17` tests, pass toàn bộ
- `e2e smoke`: `1` suite, `1` test, pass toàn bộ

Tổng cộng:

- `22` suites
- `128` tests
- `0` test fail

### 4.2 Coverage

Lệnh đã chạy:

```bash
npm run test:cov -- --runInBand
```

Coverage hiện tại của unit suite:

- Statements: `63.84%`
- Branches: `53.60%`
- Functions: `29.62%`
- Lines: `61.85%`

Một số vùng đã được cải thiện rõ:

- `TripsService`: `100%` statements / `100%` lines
- `TrackingService`: `95.08%` statements / `96.49%` lines
- `OrdersService`: `100%` statements / `100%` lines
- `PaymentService`: `94.33%` statements / `95.83%` lines
- `AnalyticsService`: `100%` statements / `100%` lines

## 5. Test case matrix

### Unit

- Auth service:
  - register
  - send OTP
  - login
  - refresh token
  - logout
  - forgot password
- Orders service:
  - create order
  - shipping fee
  - nearest hub
  - CRUD pass-through
- Trips service:
  - local/global auto-dispatch
  - find trip
  - update status
  - complete trip
  - cancel order from trip
- Tracking service:
  - state transition
  - failed delivery attempts
  - trip completion enqueue
  - public timeline sanitize
- Payment service:
  - payment intent
  - COD confirm
  - webhook success/fail
  - payment lookup
- Analytics service:
  - repository pass-through

### API automation

- Auth:
  - `POST /auth/otp`
  - `POST /auth/login`
- Orders:
  - `POST /orders`
  - `GET /orders`
  - `PUT /orders/:id/status`
  - invalid `GET /orders/:id`
- Trips:
  - `POST /trips/auto-dispatch`
  - `POST /trips/auto-dispatch/all`
  - `PATCH /trips/:id/status`
- Payment:
  - `POST /payments/webhook` missing signature
  - `POST /payments/webhook` with raw payload
  - `POST /payments/create-intent/:orderId`
- Tracking:
  - `POST /tracking-events`
  - invalid delivered payload without POD
  - `GET /tracking-events/public/:trackingCode`
- Analytics:
  - `GET /analytics/dashboard`
  - invalid `dateRange`

### E2E smoke

- `GET /` returns `Hello World!`

## 6. Ghi chú quan trọng

- Log lỗi `Webhook signature verification failed: invalid sig` xuất hiện trong quá trình chạy unit tests là **expected log** từ test negative-path của `PaymentService`; test vẫn pass.
- Automation suite hiện đang là HTTP contract tests đi qua Nest request pipeline thật, có:
  - `ZodValidationPipe`
  - `ZodSerializerInterceptor`
  - route params/query/body parsing
  - request decorators như `@ActiveUser`, `@UserAgent`
- Các phụ thuộc ngoài vẫn đang được mock/override để suite ổn định:
  - Stripe
  - guard chain
  - service bên ngoài
- Chưa có một dedicated Prisma test database/seed riêng cho API automation. Nếu cần true integration với DB thật, nên bổ sung:
  - `.env.test`
  - database test isolation
  - seed/cleanup riêng cho automation layer

## 7. Khu vực coverage còn thấp

- Repository classes dùng Prisma trực tiếp:
  - `trip.repository.ts`
  - `tracking.repo.ts`
  - `order.repo.ts`
  - `analytics.repo.ts`
- Processor/background logic:
  - `trips.processor.ts`
  - `green-tech.processor.ts`
- Guards phụ thuộc auth/runtime:
  - `access-token.guard.ts`
  - `roles.guard.ts`
- OAuth/third-party integration:
  - `google.service.ts`

## 8. Kết luận

Backend hiện đã có bộ test chạy ổn định ở 3 tầng `unit`, `api`, và `e2e smoke`, cùng script `test:full` để kiểm tra toàn dự án một lần. Các lỗi fail sẵn trong suite cũ đã được xử lý, và báo cáo này phản ánh đúng trạng thái thực thi hiện tại.
