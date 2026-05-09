# Backend performance va xu ly loi

Last synced with code: 2026-05-05.

Tai lieu nay ghi cac quy uoc runtime, logging, error contract va nhung diem can chu y khi debug hieu nang.

## Runtime knobs

| Bien                           | Mac dinh                         | Tac dung                                                                 |
| ------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                         | `3000`                           | Port listen neu `process.env.PORT`/`envConfig.PORT` co gia tri.          |
| `CORS_ORIGINS`                 | `http://localhost:3000`          | Comma-separated allowed origins.                                         |
| `DB_POOL_MAX`                  | `10`                             | So connection toi da cua PostgreSQL pool.                                |
| `DB_POOL_IDLE_TIMEOUT_MS`      | `30000`                          | Thoi gian dong idle connection.                                          |
| `PRISMA_QUERY_LOG`             | off                              | Set `1` de log query Prisma o local. Production chi log `warn`, `error`. |
| `SLOW_REQUEST_MS`              | `1000`                           | Nguong request cham de logging middleware gan `slow=yes`.                |
| `TRACKING_ACCESS_CACHE_TTL_MS` | `15000`                          | TTL cache quyen join tracking room.                                      |
| `OSRM_BASE_URL`                | `http://router.project-osrm.org` | OSRM server cho route optimization.                                      |
| `REDIS_URL`                    | none                             | Override Redis URL cho cache store.                                      |

## Request id va log

`RequestIdMiddleware` doc header `x-request-id` tu client hoac tao UUID moi. Response luon tra lai `x-request-id` de frontend/log collector doi chieu.

`LoggingMiddleware` log request theo dang:

```text
[requestId] METHOD /path status durationMs | size=bytes uid=userId slow=yes|no ua="..."
```

Log level:

- `error`: request `5xx`.
- `warn`: request `4xx` hoac vuot `SLOW_REQUEST_MS`.
- `log`: request binh thuong.

Khong dua token, password, OTP, Stripe secret, Cloudinary secret, API key vao log.

## Error envelope

Moi exception HTTP di qua `AllExceptionsFilter`.

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

Quy uoc:

- `statusCode`: HTTP status.
- `message`: thong diep hien thi hoac machine-readable message.
- `errorCode`: optional, uu tien message dang `Error.*` hoac service-provided `errorCode`.
- `errors`: validation detail hoac service error detail.
- `requestId`: gia tri tu middleware.
- `path`, `timestamp`: context debug.

Frontend nen map theo `errorCode` neu co, fallback sang `message`.

## Validation errors

Request DTO dung Zod. Mot so rule dang chu y:

- Auth register/forgot password yeu cau confirm password khop.
- Order create/quote yeu cau it nhat 1 item, item co `weight > 0`, kich thuoc neu co phai positive.
- Tracking `STATUS_CHANGE` phai co `status`.
- Tracking `EXCEPTION` phai co `failureReasonCode`.
- Tracking status `DELIVERED` phai co POD.
- Trip assignment approve phai co `tripId` hoac `vehicleId`.
- Hub code chi cho chu in hoa, so va dau gach ngang.
- Upload yeu cau file field dung ten: `file` hoac `files`.

## Auth, permission, throttling

Default endpoint auth la Bearer. Public route phai duoc danh dau `@isPublic()`.

Permission path duoc normalize tu Express `baseUrl + route.path`, sau do check voi method trong role permissions. Khi them/sua route, chay:

```bash
npm run p
```

Global throttler: 100 requests / 60 giay. Endpoint throttling rieng:

| Endpoint                                | Limit                 |
| --------------------------------------- | --------------------- |
| `POST /auth/otp`                        | 1 request / 60 giay   |
| `POST /auth/login`                      | 5 requests / 60 giay  |
| `POST /auth/forgot-password`            | 3 requests / 15 phut  |
| `POST /orders/quote`                    | 10 requests / 60 giay |
| `POST /orders`                          | 5 requests / 60 giay  |
| `POST /payments/create-intent/:orderId` | 3 requests / 60 giay  |

## Query va response performance

Quy uoc API:

- List endpoint tra summary nhe.
- Detail endpoint moi tra nested data.
- Orders list khong keo receiver detail day du nhu detail response.
- Trips list tra trip/stops summary; dispatch board co shape rieng de dashboard scan nhanh.
- Dispatch board hot path co query limit mac dinh de tranh payload/query runaway:
  `ordersLimit=100`, `pendingTripsLimit=50`, `driversLimit=200`, `vehiclesLimit=200`.
  Driver board dung `assignableOrdersLimit=100`, `requestsLimit=12`.
  Response co `limits` va `hasMore` de client biet danh sach da bi cat.
- Notifications list filter theo current user va co `isRead`.
- Analytics endpoint chi danh cho admin va nen co date range ro rang.
- Observability list endpoints validate `page`/`limit` bang DTO; `limit=abc`, `page=0`, `limit>100` fail tai boundary thay vi truyen `NaN` xuong Prisma.

Indexes lien quan den list/dashboard duoc them trong migrations gan day, gom order/notification/role request/driver assignment request/trip tracking use cases. Neu query cham bat thuong sau deploy, kiem tra migration da apply.

## Database va Prisma

`PrismaService` dung `PrismaPg` adapter voi PostgreSQL pool:

- `DATABASE_URL` la connection string bat buoc.
- `DB_POOL_MAX` va `DB_POOL_IDLE_TIMEOUT_MS` kiem soat pool.
- Production khong log query mac dinh.

Chi bat `PRISMA_QUERY_LOG=1` o local hoac trong thoi gian ngan khi debug. Khong bat dai han o production vi co the lo PII va tao log volume lon.

Dung transaction khi nghiep vu:

- Tao trip + stops + update order.
- Cap nhat order status + tracking event + POD + COD settlement.
- Approve/reject assignment request kem tao/cap nhat trip.
- Reconcile wallet/COD.

## Cache va queue

Cache:

- Global cache TTL 60 giay qua Redis Keyv.
- Role permission cache TTL 1 gio theo key `roleId:<id>`.
- Tracking room access cache TTL default 15 giay.

Queue:

- Trips auto-dispatch dung BullMQ.
- Green-tech emission calculation dung BullMQ processor.
- Redis connection cho BullMQ doc tu `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`.

Khi Redis loi, auth permission cache, BullMQ va tracking performance deu co the bi anh huong.

## Tracking realtime

Socket.IO namespace: `/tracking`.

Performance notes:

- Client nen dung transport `websocket`.
- Dashboard chi join nhung trip dang hien thi hoac dang active.
- Driver chi gui `driverLocationUpdate` cho active/owned trip.
- Server cache quyen join room ngan han de tranh query lap khi dashboard sync nhieu trip.

Events:

- Inbound: `joinTripTracking`, `leaveTripTracking`, `driverLocationUpdate`.
- Outbound: `locationUpdated`, `dashboard.tripCreated`.

## Route optimization

`POST /trips/:id/optimize-route`:

1. Lay hub xuat phat tu vehicle's hub.
2. Build waypoint theo stop type:
   - `PICKUP`: sender coordinates.
   - `HUB_TRANSFER`: hub coordinates.
   - Default/dropoff: receiver coordinates.
3. Goi OSRM `/trip/v1/driving`.
4. Neu OSRM fail, fallback sang Haversine.
5. Update `TripStop.stopSequence` trong transaction va cap nhat `Trip.totalDistance`.

Response co:

- `provider`: `OSRM` hoac `HAVERSINE`.
- `fallbackUsed`: boolean.
- `totalDistance`: km.
- `totalDuration`: seconds.
- `stops`: optimized stop order.

Debug route optimization:

- Kiem tra vehicle co hub va hub co `latitude`/`longitude`.
- Kiem tra moi stop co toa do phu hop.
- Kiem tra `OSRM_BASE_URL` neu muon dung OSRM rieng.
- Neu `fallbackUsed=true`, xem warn log cua `OsrmRoutingClient`.

## Stripe webhook

`main.ts` tao app voi raw body:

```ts
NestFactory.create(AppModule, { rawBody: true })
```

Webhook endpoint:

- Path: `POST /payments/webhook`
- Public route nhung protect bang `stripe-signature`.
- Payload uu tien `req.rawBody`, fallback `JSON.stringify(body)` cho unit test.

Debug:

- Thieu header tra `Missing stripe-signature header`.
- Signature sai thuong do body bi parse/serialize lai truoc khi verify.
- Kiem tra `STRIPE_WEBHOOK_SECRET`.

## Upload

Cloudinary upload endpoints dung Multer options trong `upload.constants.ts`.

- `POST /upload/image`: field `file`, allowed folder query `logistic_vehicles`, `logistic_hubs`, `logistic_general`.
- `POST /upload/pod`: field `file`, folder `logistic_pod`.
- `POST /upload/multiple-pod`: field `files`, max 5.

Debug upload:

- Kiem tra field name tren multipart request.
- Kiem tra MIME/size rule trong `uploadMulterOptions`.
- Kiem tra Cloudinary env.

## Checklist debug request cham

1. Lay `x-request-id` tu response.
2. Tim backend log theo `[requestId]`.
3. Neu `slow=yes`, xac dinh endpoint dang la list hay detail.
4. Kiem tra user role/hub scope co gay query permission/resource lap khong.
5. Bat tam `PRISMA_QUERY_LOG=1` o local de xem query.
6. Kiem tra migration index da apply bang `npx prisma migrate status`.
7. Voi Redis-related slowdown, kiem tra Redis latency va connection settings.
8. Voi route optimization, xem `fallbackUsed` va warn log OSRM.

## Checklist khi them endpoint moi

1. Dung Zod schema cho body/query/params.
2. Xac dinh endpoint public hay Bearer.
3. Them `@Roles` neu can role restriction.
4. Them `@ResourceAccess` neu can owner/hub protection.
5. Chay `npm run p` de sync permission.
6. Cap nhat API docs.
7. Them test cho validation, permission va loi nghiep vu.
