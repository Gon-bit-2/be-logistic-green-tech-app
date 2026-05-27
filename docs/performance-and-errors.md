# Backend performance và xử lý lỗi

Last synced with code: 2026-05-05.

Tài liệu này ghi các quy ước runtime, logging, error contract và những điểm cần chú ý khi debug hiệu năng.

## Runtime knobs

| Biến                           | Mặc định                         | Tác dụng                                                                 |
| ------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                         | `3000`                           | Port listen nếu `process.env.PORT`/`envConfig.PORT` có giá trị.          |
| `CORS_ORIGINS`                 | `http://localhost:3000`          | Comma-separated allowed origins.                                         |
| `DB_POOL_MAX`                  | `10`                             | Số connection tối đa của PostgreSQL pool.                                |
| `DB_POOL_IDLE_TIMEOUT_MS`      | `30000`                          | Thời gian đóng idle connection.                                          |
| `PRISMA_QUERY_LOG`             | off                              | Set `1` để log query Prisma ở local. Production chỉ log `warn`, `error`. |
| `SLOW_REQUEST_MS`              | `1000`                           | Ngưỡng request chậm để logging middleware gắn `slow=yes`.                |
| `TRACKING_ACCESS_CACHE_TTL_MS` | `15000`                          | TTL cache quyền join tracking room.                                      |
| `OSRM_BASE_URL`                | `http://router.project-osrm.org` | OSRM server cho route optimization.                                      |
| `REDIS_URL`                    | none                             | Override Redis URL cho cache store.                                      |

## Request id và log

`RequestIdMiddleware` đọc header `x-request-id` từ client hoặc tạo UUID mới. Response luôn trả lại `x-request-id` để frontend/log collector đối chiếu.

`LoggingMiddleware` log request theo dạng:

```text
[requestId] METHOD /path status durationMs | size=bytes uid=userId slow=yes|no ua="..."
```

Log level:

- `error`: request `5xx`.
- `warn`: request `4xx` hoặc vượt `SLOW_REQUEST_MS`.
- `log`: request bình thường.

Không đưa token, password, OTP, Stripe secret, Cloudinary secret, API key vào log.

## Error envelope

Mọi exception HTTP đi qua `AllExceptionsFilter`.

```json
{
  "statusCode": 400,
  "message": "Không thể chuyển từ \"PENDING\" sang \"DELIVERED\". Chỉ cho phép: [ASSIGNED, CANCELLED]",
  "errorCode": "Error.Domain.Code",
  "errors": {},
  "requestId": "uuid",
  "path": "/tracking-events",
  "timestamp": "2026-05-05T00:00:00.000Z"
}
```

Quy ước:

- `statusCode`: HTTP status.
- `message`: thông điệp hiển thị hoặc machine-readable message.
- `errorCode`: optional, ưu tiên message dạng `Error.*` hoặc service-provided `errorCode`.
- `errors`: validation detail hoặc service error detail.
- `requestId`: giá trị từ middleware.
- `path`, `timestamp`: context debug.

Frontend nên map theo `errorCode` nếu có, fallback sang `message`.

## Validation errors

Request DTO dùng Zod. Một số rule đáng chú ý:

- Auth register/forgot password yêu cầu confirm password khớp.
- Order create/quote yêu cầu ít nhất 1 item, item có `weight > 0`, kích thước nếu có phải positive.
- Tracking `STATUS_CHANGE` phải có `status`.
- Tracking `EXCEPTION` phải có `failureReasonCode`.
- Tracking status `DELIVERED` phải có POD.
- Trip assignment approve phải có `tripId` hoặc `vehicleId`.
- Hub code chỉ cho chữ in hoa, số và dấu gạch ngang.
- Upload yêu cầu file field đúng tên: `file` hoặc `files`.

## Auth, permission, throttling

Default endpoint auth là Bearer. Public route phải được đánh dấu `@isPublic()`.

Permission path được normalize từ Express `baseUrl + route.path`, sau đó check với method trong role permissions. Khi thêm/sửa route, chạy:

```bash
npm run p
```

Global throttler: 100 requests / 60 giây. Endpoint throttling riêng:

| Endpoint                                | Limit                 |
| --------------------------------------- | --------------------- |
| `POST /auth/otp`                        | 1 request / 60 giây   |
| `POST /auth/login`                      | 5 requests / 60 giây  |
| `POST /auth/forgot-password`            | 3 requests / 15 phút  |
| `POST /orders/quote`                    | 10 requests / 60 giây |
| `POST /orders`                          | 5 requests / 60 giây  |
| `POST /payments/create-intent/:orderId` | 3 requests / 60 giây  |

## Query và response performance

Quy ước API:

- List endpoint trả summary nhẹ.
- Detail endpoint mới trả nested data.
- Orders list không kéo receiver detail đầy đủ như detail response.
- Trips list trả trip/stops summary; dispatch board có shape riêng để dashboard scan nhanh.
- Dispatch board hot path có query limit mặc định để tránh payload/query runaway:
  `ordersLimit=100`, `pendingTripsLimit=50`, `driversLimit=200`, `vehiclesLimit=200`.
  Driver board dùng `assignableOrdersLimit=100`, `requestsLimit=12`.
  Response có `limits` và `hasMore` để client biết danh sách đã bị cắt.
- Notifications list filter theo current user và có `isRead`.
- Analytics endpoint chỉ dành cho admin và nên có date range rõ ràng.
- Observability list endpoints validate `page`/`limit` bằng DTO; `limit=abc`, `page=0`, `limit>100` fail tại boundary thay vì truyền `NaN` xuống Prisma.

Indexes liên quan đến list/dashboard được thêm trong migrations gần đây, gồm order/notification/role request/driver assignment request/trip tracking use cases. Nếu query chậm bất thường sau deploy, kiểm tra migration đã apply.

## Database và Prisma

`PrismaService` dùng `PrismaPg` adapter với PostgreSQL pool:

- `DATABASE_URL` là connection string bắt buộc.
- `DB_POOL_MAX` và `DB_POOL_IDLE_TIMEOUT_MS` kiểm soát pool.
- Production không log query mặc định.

Chỉ bật `PRISMA_QUERY_LOG=1` ở local hoặc trong thời gian ngắn khi debug. Không bật dài hạn ở production vì có thể lộ PII và tạo log volume lớn.

Dùng transaction khi nghiệp vụ:

- Tạo trip + stops + update order.
- Cập nhật order status + tracking event + POD + COD settlement.
- Approve/reject assignment request kèm tạo/cập nhật trip.
- Reconcile wallet/COD.

## Cache và queue

Cache:

- Global cache TTL 60 giây qua Redis Keyv.
- Role permission cache TTL 1 giờ theo key `roleId:<id>`.
- Tracking room access cache TTL default 15 giây.

Queue:

- Trips auto-dispatch dùng BullMQ.
- Green-tech emission calculation dùng BullMQ processor.
- Redis connection cho BullMQ đọc từ `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`.

Khi Redis lỗi, auth permission cache, BullMQ và tracking performance đều có thể bị ảnh hưởng.

## Tracking realtime

Socket.IO namespace: `/tracking`.

Performance notes:

- Client nên dùng transport `websocket`.
- Dashboard chỉ join những trip đang hiển thị hoặc đang active.
- Driver chỉ gửi `driverLocationUpdate` cho active/owned trip.
- Server cache quyền join room ngắn hạn để tránh query lặp khi dashboard sync nhiều trip.

Events:

- Inbound: `joinTripTracking`, `leaveTripTracking`, `driverLocationUpdate`.
- Outbound: `locationUpdated`, `dashboard.tripCreated`.

## Route optimization

`POST /trips/:id/optimize-route`:

1. Lấy hub xuất phát từ vehicle's hub.
2. Build waypoint theo stop type:
   - `PICKUP`: sender coordinates.
   - `HUB_TRANSFER`: hub coordinates.
   - Default/dropoff: receiver coordinates.
3. Gọi OSRM `/trip/v1/driving`.
4. Nếu OSRM fail, fallback sang Haversine.
5. Update `TripStop.stopSequence` trong transaction và cập nhật `Trip.totalDistance`.

Response có:

- `provider`: `OSRM` hoặc `HAVERSINE`.
- `fallbackUsed`: boolean.
- `totalDistance`: km.
- `totalDuration`: seconds.
- `stops`: optimized stop order.

Debug route optimization:

- Kiểm tra vehicle có hub và hub có `latitude`/`longitude`.
- Kiểm tra mỗi stop có tọa độ phù hợp.
- Kiểm tra `OSRM_BASE_URL` nếu muốn dùng OSRM riêng.
- Nếu `fallbackUsed=true`, xem warn log của `OsrmRoutingClient`.

## Stripe webhook

`main.ts` tạo app với raw body:

```ts
NestFactory.create(AppModule, { rawBody: true })
```

Webhook endpoint:

- Path: `POST /payments/webhook`
- Public route nhưng protect bằng `stripe-signature`.
- Payload ưu tiên `req.rawBody`, fallback `JSON.stringify(body)` cho unit test.

Debug:

- Thiếu header trả `Missing stripe-signature header`.
- Signature sai thường do body bị parse/serialize lại trước khi verify.
- Kiểm tra `STRIPE_WEBHOOK_SECRET`.

## Upload

Cloudinary upload endpoints dùng Multer options trong `upload.constants.ts`.

- `POST /upload/image`: field `file`, allowed folder query `logistic_vehicles`, `logistic_hubs`, `logistic_general`.
- `POST /upload/pod`: field `file`, folder `logistic_pod`.
- `POST /upload/multiple-pod`: field `files`, max 5.

Debug upload:

- Kiểm tra field name trên multipart request.
- Kiểm tra MIME/size rule trong `uploadMulterOptions`.
- Kiểm tra Cloudinary env.

## Checklist debug request chậm

1. Lấy `x-request-id` từ response.
2. Tìm backend log theo `[requestId]`.
3. Nếu `slow=yes`, xác định endpoint đang là list hay detail.
4. Kiểm tra user role/hub scope có gây query permission/resource lặp không.
5. Bật tạm `PRISMA_QUERY_LOG=1` ở local để xem query.
6. Kiểm tra migration index đã apply bằng `npx prisma migrate status`.
7. Với Redis-related slowdown, kiểm tra Redis latency và connection settings.
8. Với route optimization, xem `fallbackUsed` và warn log OSRM.

## Checklist khi thêm endpoint mới

1. Dùng Zod schema cho body/query/params.
2. Xác định endpoint public hay Bearer.
3. Thêm `@Roles` nếu cần role restriction.
4. Thêm `@ResourceAccess` nếu cần owner/hub protection.
5. Chạy `npm run p` để sync permission.
6. Cập nhật API docs.
7. Thêm test cho validation, permission và lỗi nghiệp vụ.



