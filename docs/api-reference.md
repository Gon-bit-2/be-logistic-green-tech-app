# Backend API reference

Last synced with code: 2026-05-05.

Backend khong dung global prefix `/api`. Base URL local thuong la `http://localhost:<PORT>`, vi du `http://localhost:8386/orders`.

## Contract chung

- Success response tra ve truc tiep theo DTO cua endpoint, khong boc them envelope global.
- Error response di qua `AllExceptionsFilter` va co dang on dinh:

```json
{
  "statusCode": 403,
  "message": "Error.PermissionDenied.NotYourHub",
  "errorCode": "Error.PermissionDenied.NotYourHub",
  "errors": {},
  "requestId": "uuid",
  "path": "/orders",
  "timestamp": "2026-05-05T00:00:00.000Z"
}
```

- `requestId` duoc doc tu header `x-request-id` hoac tu tao moi; response luon tra lai header nay.
- Validation dung Zod. Validation error nam trong `errors`.
- Pagination query dung chung: `page`, `limit`; tuy module co the chi tra `data` va `totalItems`.

## Auth va permission

Mac dinh moi endpoint can Bearer token, tru cac endpoint co `@isPublic()`.

Header:

```http
Authorization: Bearer <accessToken>
```

Guard chinh:

- `AuthenticationGuard`: xac thuc Bearer/API key/Payment API key theo metadata. Mac dinh la Bearer.
- `AccessTokenGuard`: verify access token, sau do check permission theo `roleId + path + method`.
- `RolesGuard`: check role metadata; `ADMIN` bypass role restriction.
- `ResourceAccessGuard`: check owner/hub scope cho endpoint co `@ResourceAccess`.

Public endpoints:

- `GET /`
- `GET /health`
- `POST /auth/otp`
- `POST /auth/verify-otp`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh-token`
- `POST /auth/logout`
- `GET /auth/google-link`
- `GET /auth/google/callback`
- `POST /auth/google/session`
- `POST /auth/forgot-password`
- `POST /payments/webhook`
- `GET /tracking-events/public/:trackingCode`

Role names: `ADMIN`, `CUSTOMER`, `DRIVER`, `WAREHOUSE_STAFF`.

## Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | Public | App hello string. |
| GET | `/health` | Public | `status`, `timestamp`, `uptime`, memory usage. |

## Auth

| Method | Path | Auth | Body / query |
| --- | --- | --- | --- |
| GET | `/auth/profile` | Bearer | Current user profile with role and permissions. |
| PATCH | `/auth/profile` | Bearer | `fullName?`, `phone?`, `avatar?`; at least one field. |
| GET | `/auth/address-book` | Bearer | Current user's address book. |
| POST | `/auth/address-book` | Bearer | `contactName`, `phone`, `address`, optional `label`, `latitude`, `longitude`, `isDefault`. |
| PATCH | `/auth/address-book/:id` | Bearer | Partial address book body; owner only. |
| DELETE | `/auth/address-book/:id` | Bearer | Delete current user's address. |
| POST | `/auth/otp` | Public | `email`, `type` = `REGISTER` \| `FORGOT_PASSWORD` \| `LOGIN`; throttled 1/min. |
| POST | `/auth/verify-otp` | Public | `email`, `code`, `type`. |
| POST | `/auth/register` | Public | `email`, `password`, `confirmPassword`, `fullName`, `phone`, `code`. |
| POST | `/auth/login` | Public | `email`, `password`, optional OTP `code`; throttled 5/min. |
| POST | `/auth/refresh-token` | Public | `refreshToken`. |
| POST | `/auth/logout` | Public | `refreshToken`. |
| GET | `/auth/google-link` | Public | Returns Google authorization URL. |
| GET | `/auth/google/callback` | Public | Google redirects here with `state`, `code`, optional `error`. |
| POST | `/auth/google/session` | Public | `sessionToken` UUID returned through client redirect. |
| POST | `/auth/forgot-password` | Public | `email`, `code`, `newPassword`, `confirmNewPassword`; throttled 3/15min. |

Auth token response:

```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

## Orders

Order status: `PENDING`, `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`, `ARRIVED_AT_HUB`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.

Service type: `EXPRESS`, `STANDARD`, `ECO_GREEN`. Payment method: `STRIPE`, `COD`.

| Method | Path | Roles | Body / query |
| --- | --- | --- | --- |
| POST | `/orders/quote` | Customer, Admin, Warehouse | Quote only; same fields as create order except `customerId`, `paymentMethod`; throttled 10/min. |
| POST | `/orders` | Customer, Admin, Warehouse | Create order; throttled 5/min. |
| GET | `/orders` | Customer, Admin, Warehouse | `page`, `limit`, `search?`, `trackingCode?`, `status?`, `currentHubId?`. Customer is forced to own orders. |
| GET | `/orders/:id` | Customer, Admin, Warehouse | Detail. Customer owner scope; warehouse `currentHubId` scope. |
| PUT | `/orders/:id/status` | Customer, Admin, Warehouse | `{ "status": "..." }`; owner/hub scoped. |
| PATCH | `/orders/:id/cancel` | Customer, Admin, Warehouse | Cancel order; owner scoped. |
| DELETE | `/orders/:id` | Customer, Admin, Warehouse | Soft delete; owner/hub scoped. |

Create order body:

```json
{
  "customerId": 1,
  "senderName": "Sender",
  "senderPhone": "0900000000",
  "senderAddress": "Sender address",
  "senderLat": 10.77,
  "senderLng": 106.7,
  "receiverName": "Receiver",
  "receiverPhone": "0911111111",
  "receiverAddress": "Receiver address",
  "receiverLat": 10.8,
  "receiverLng": 106.75,
  "preferredDeliveryTimeStart": "2026-05-05T08:00:00.000Z",
  "preferredDeliveryTimeEnd": "2026-05-05T12:00:00.000Z",
  "serviceType": "STANDARD",
  "paymentMethod": "STRIPE",
  "items": [
    {
      "name": "Box",
      "quantity": 1,
      "weight": 2,
      "length": 20,
      "width": 15,
      "height": 10
    }
  ]
}
```

Quote response includes `distanceMeters`, `durationSeconds`, `shippingFee`, `currency`, `serviceType`, `estimatedCo2Saved`, `polyline`.

## Payments

Payment status: `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`.

| Method | Path | Auth / roles | Notes |
| --- | --- | --- | --- |
| POST | `/payments/create-intent/:orderId` | Customer | Creates Stripe PaymentIntent; throttled 3/min. |
| POST | `/payments/cod-confirm/:orderId` | Driver | Driver confirms COD collection. |
| GET | `/payments/order/:orderId` | Customer, Driver, Admin, Warehouse | Payment status for order, permission scoped by service. |
| POST | `/payments/webhook` | Public + Stripe signature | Requires `stripe-signature`; uses raw body from `NestFactory.create(..., { rawBody: true })`. |

## Trips and dispatch

Trip status: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Stop type: `PICKUP`, `DROPOFF`, `HUB_TRANSFER`.

| Method | Path | Roles | Body / query |
| --- | --- | --- | --- |
| POST | `/trips/manual` | Admin, Warehouse | `hubId?`, `vehicleId`, `driverId`, `orderIds[]`. |
| GET | `/trips/dispatch-preview` | Admin, Warehouse | Query `hubId?`. |
| GET | `/trips/dispatch-board` | Admin, Warehouse | Query `hubId?`; returns dispatchable orders, drivers, vehicles, pending trips, summary. |
| GET | `/trips/driver-dispatch-board` | Driver | Driver view of assignable orders and requests. |
| GET | `/trips/driver-assignment-requests` | Driver | Driver's requests. |
| POST | `/trips/driver-assignment-requests` | Driver | `{ "orderId": 1 }`. |
| GET | `/trips/assignment-requests` | Warehouse | Warehouse inbox for driver assignment requests. |
| PATCH | `/trips/assignment-requests/:id/approve` | Warehouse | `{ "tripId": 1 }` or `{ "vehicleId": 1 }`. |
| PATCH | `/trips/assignment-requests/:id/reject` | Warehouse | `{ "reviewNote": "..." }`. |
| POST | `/trips/dispatch-approve` | Admin, Warehouse | Approve dispatch plan. |
| PATCH | `/trips/:id/vehicle` | Admin, Warehouse | `{ "vehicleId": 1, "driverId": 2? }`. |
| POST | `/trips/:id/orders` | Admin, Warehouse | `{ "orderIds": [1, 2] }`. |
| POST | `/trips/auto-dispatch` | Admin, Warehouse | Query `hubId?`; enqueues local or global task. |
| POST | `/trips/auto-dispatch/all` | Admin | Enqueues global task. |
| POST | `/trips/:id/optimize-route` | Admin, Warehouse, Driver | Optimizes stop sequence; driver owner scoped. |
| GET | `/trips` | Admin, Warehouse, Driver | `page`, `limit`, `status?`, `vehicleId?`, `driverId?`, `hubId?`; driver is forced to own trips. |
| GET | `/trips/:id` | Admin, Warehouse, Driver | Detail; driver owner scoped. |
| PATCH | `/trips/:id/status` | Admin, Warehouse, Driver | `{ "status": "...", "podByOrderId": { "1": <POD> }? }`; driver owner scoped. |
| PATCH | `/trips/:id/cancel-order/:orderId` | Admin, Warehouse | Cancel/remove order from trip. |

Dispatch approve body:

```json
{
  "hubId": 1,
  "vehicleId": 2,
  "driverId": 3,
  "orderIds": [10, 11],
  "stops": [
    {
      "orderId": 10,
      "stopSequence": 1,
      "stopType": "PICKUP",
      "expectedArrivalTime": "2026-05-05T08:30:00.000Z"
    }
  ]
}
```

Route optimization uses OSRM `/trip/v1/driving`. If OSRM fails or returns invalid data, backend falls back to Haversine sequence and returns `fallbackUsed: true`, `provider: "HAVERSINE"`.

## Tracking events

Tracking event type: `STATUS_CHANGE`, `SCAN`, `NOTE`, `POD`, `EXCEPTION`, `ETA_UPDATE`.

Source: `DRIVER_APP`, `HUB_SCANNER`, `SYSTEM`, `ADMIN_PORTAL`, `CUSTOMER_APP`.

Failure reason: `CUSTOMER_NOT_AVAILABLE`, `INCORRECT_ADDRESS`, `REFUSED_BY_CUSTOMER`, `BUSINESS_CLOSED`, `INACCESSIBLE_LOCATION`, `PACKAGE_DAMAGED`, `WEATHER_DELAY`, `VEHICLE_BREAKDOWN`, `OTHER`.

Package condition: `INTACT`, `DAMAGED`, `PARTIAL`. Proof image type: `PACKAGE`, `SIGNATURE`, `DELIVERY_LOCATION`, `DAMAGE_EVIDENCE`, `FAILED_ATTEMPT`.

| Method | Path | Auth / roles | Body / query |
| --- | --- | --- | --- |
| POST | `/tracking-events` | Driver, Warehouse, Admin | Create tracking event. |
| GET | `/tracking-events` | Bearer | Query `orderId`. Service enforces access. |
| GET | `/tracking-events/public/:trackingCode` | Public | Public timeline by tracking code. |

Create tracking event body:

```json
{
  "orderId": 1,
  "eventType": "STATUS_CHANGE",
  "status": "OUT_FOR_DELIVERY",
  "source": "DRIVER_APP",
  "latitude": 10.77,
  "longitude": 106.7,
  "location": "District 1",
  "description": "Driver departed",
  "occurredAt": "2026-05-05T08:00:00.000Z"
}
```

Rules:

- `STATUS_CHANGE` requires `status`.
- `EXCEPTION` requires `failureReasonCode`.
- `DELIVERED` requires `pod`.
- Order state transitions are validated by `OrderStateService`.

Allowed customer-facing transitions:

| From | To |
| --- | --- |
| `PENDING` | `ASSIGNED`, `CANCELLED` |
| `ASSIGNED` | `PICKED_UP`, `CANCELLED` |
| `PICKED_UP` | `IN_TRANSIT` |
| `IN_TRANSIT` | `ARRIVED_AT_HUB`, `OUT_FOR_DELIVERY` |
| `ARRIVED_AT_HUB` | `IN_TRANSIT` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `CANCELLED` |

POD body:

```json
{
  "receiverName": "Receiver",
  "receiverRelation": "Self",
  "packageCondition": "INTACT",
  "deliveryNote": "Delivered at reception",
  "images": [
    {
      "url": "https://res.cloudinary.com/.../pod.jpg",
      "type": "PACKAGE"
    }
  ]
}
```

## Tracking WebSocket

Namespace Socket.IO: `/tracking`.

Client auth:

```ts
io(`${API_BASE_URL}/tracking`, {
  auth: { token: accessToken },
  transports: ['websocket'],
})
```

Inbound events:

- `joinTripTracking`: body `{ tripId }`; server checks trip access and joins room `trip_<id>`.
- `leaveTripTracking`: body `{ tripId }`.
- `driverLocationUpdate`: body `{ tripId, lat, lng }`; driver must own trip.

Outbound events:

- `locationUpdated`: broadcast to trip room after driver update.
- `dashboard.tripCreated`: emitted when dispatch creates a trip so operations dashboard can refresh.

Tracking access cache TTL is controlled by `TRACKING_ACCESS_CACHE_TTL_MS` and defaults to 15000 ms.

## Maps

All maps endpoints allow `CUSTOMER`, `ADMIN`, `WAREHOUSE_STAFF`, `DRIVER`.

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/maps/places/autocomplete` | `input`, optional `sessionToken`, `lat`, `lng`, `limit` max 20 default 10. |
| GET | `/maps/places/detail` | `placeId`, optional `sessionToken`. |
| GET | `/maps/geocode` | `address`. |
| POST | `/maps/directions` | `origin { lat, lng }`, `destination { lat, lng }`, optional `vehicle`: `car`, `bike`, `taxi`, `truck`, `hd`. |

Maps service calls Goong API through `GOONG_BASE_URL` and `GOONG_MAPS_API_KEY`.

## Vehicles

Vehicle type: `VAN`, `TRUCK`, `ELECTRIC_VAN`, `MOTORCYCLE`. Fuel type: `DIESEL`, `ELECTRIC`, `GASOLINE`.

All vehicle endpoints require `ADMIN`.

| Method | Path | Body / query |
| --- | --- | --- |
| POST | `/vehicles` | `licensePlate`, `type`, `fuelType`, `capacityWeight`, `capacityVolume`, `emissionRatePerKm`, `hubId`, optional `imageUrl`. |
| GET | `/vehicles` | `page`, `limit`, `type?`, `fuelType?`, `isActive?`, `search?`. |
| GET | `/vehicles/:id` | Vehicle detail. |
| PATCH | `/vehicles/:id` | Partial create body plus optional `isActive`. |
| DELETE | `/vehicles/:id` | Soft delete. |

## Hubs

| Method | Path | Auth / roles | Body / query |
| --- | --- | --- | --- |
| POST | `/hubs` | Admin | `code`, `name`, `address`, `latitude`, `longitude`, optional `imageUrl`. |
| GET | `/hubs` | Bearer + permission | `page`, `limit`, `search?`. |
| GET | `/hubs/:id/assignable-users` | Admin | Query `role` = `WAREHOUSE_STAFF` \| `DRIVER`, optional `search`. |
| GET | `/hubs/:id` | Bearer + permission | Hub detail. |
| PATCH | `/hubs/:id` | Admin | Partial hub body. |
| DELETE | `/hubs/:id` | Admin | Soft delete. |
| POST | `/hubs/:id/staff` | Admin | `{ "userId": 1 }`. |
| DELETE | `/hubs/:id/staff/:userId` | Admin | Remove staff from hub. |
| POST | `/hubs/:id/drivers` | Admin | `{ "userId": 1 }`. |
| DELETE | `/hubs/:id/drivers/:userId` | Admin | Remove driver from hub. |

Hub `code` must be uppercase letters/numbers/hyphen, for example `SGN-HUB-01`.

## Upload

All upload endpoints require Bearer token and permission.

| Method | Path | Form data |
| --- | --- | --- |
| POST | `/upload/image` | `file`; optional query `folder` in `logistic_vehicles`, `logistic_hubs`, `logistic_general`. |
| POST | `/upload/pod` | `file`; uploads to `logistic_pod`. |
| POST | `/upload/multiple-pod` | `files`; max count from `MAX_UPLOAD_FILE_COUNT` (currently 5). |

Response includes Cloudinary `url`, `public_id`, `format`, `bytes` where applicable.

## Notifications

Notification types include role request, driver assignment request, and order status notifications.

| Method | Path | Auth | Body / query |
| --- | --- | --- | --- |
| GET | `/notifications` | Bearer | `page`, `limit`, optional `isRead=true|false`. |
| GET | `/notifications/unread-count` | Bearer | Returns `{ "totalUnread": number }`. |
| PATCH | `/notifications/read-all` | Bearer | Mark all current user's notifications as read. |
| PATCH | `/notifications/:id/read` | Bearer | Mark one notification as read. |

## Role requests

Target role can be `DRIVER` or `WAREHOUSE_STAFF`.

| Method | Path | Roles | Body / query |
| --- | --- | --- | --- |
| POST | `/role-requests` | Customer, Driver, Warehouse | `targetRoleName`, `reason`, `hubId`. |
| GET | `/role-requests/me` | Customer, Driver, Warehouse | `page`, `limit`, optional `status`, `targetRoleName`. |
| GET | `/role-requests` | Admin | `page`, `limit`, optional `status`, `targetRoleName`. |
| PATCH | `/role-requests/:id/approve` | Admin | Optional `reviewNote`, optional `hubId`. |
| PATCH | `/role-requests/:id/reject` | Admin | Required `reviewNote`. |

## Analytics

All analytics endpoints require `ADMIN`.

Query `dateRange`: `7d`, `30d`, `90d`, `1y`; default `30d`.

| Method | Path | Response focus |
| --- | --- | --- |
| GET | `/analytics/dashboard` | Totals: orders, revenue, distance, CO2 saved, delivery time, on-time rate. |
| GET | `/analytics/orders` | Periodic order counts, revenue, avg delivery time. |
| GET | `/analytics/emissions` | Periodic emitted/saved CO2 and green trip count. |
| GET | `/analytics/fleet-performance` | Vehicle-level orders, trips, distance, efficiency, CO2 saved. |

## Green tech and gamification

| Method | Path | Auth / roles | Notes |
| --- | --- | --- | --- |
| POST | `/green-tech/calculate/:tripId` | Admin | Force emission calculation for a trip. |
| GET | `/green-tech/trips/:tripId` | Admin, Driver | Emission audit history for a trip. |
| GET | `/gamification/profile` | Bearer | Current user's green profile. |
| GET | `/gamification/leaderboard` | Bearer | Optional `limit`; default 10. |

Emission methods: `HAVERSINE`, `GPS_ACTUAL`, `MANUAL`, `TRIP_TOTAL_DISTANCE`. Allocation methods: `WEIGHT_RATIO`, `DISTANCE_RATIO`, `EQUAL_SPLIT`.

## Wallet

| Method | Path | Roles | Body |
| --- | --- | --- | --- |
| GET | `/wallet/my-wallet` | Driver | Driver wallet summary. |
| POST | `/wallet/add-cod` | Driver | `orderId`, `amount`; driver adds COD received for an order. |
| POST | `/wallet/reconcile-cod` | Admin, Warehouse | `driverId`, `amount`, `referenceId`, optional `description`. |

## Language

All language endpoints require Bearer token and permission.

| Method | Path | Body / query |
| --- | --- | --- |
| POST | `/language` | `id`, `name`, `code`. |
| GET | `/language` | List languages. |
| GET | `/language/:languageId` | Detail; `languageId` max 10 chars. |
| PUT | `/language/:languageId` | `name`, `code`. |
| DELETE | `/language/:languageId` | Soft delete. |

## Business flow chinh

1. `POST /orders/quote` tinh phi, route va CO2 du kien.
2. `POST /orders` tao order va payment record `STRIPE` hoac `COD`.
3. `POST /payments/create-intent/:orderId` va Stripe webhook hoan tat online payment; COD chay dispatch binh thuong va duoc driver confirm khi giao.
4. `GET /trips/dispatch-board`, `GET /trips/dispatch-preview`, `POST /trips/dispatch-approve` gom order thanh trip.
5. Driver cap nhat trip/order status qua `PATCH /trips/:id/status` hoac `POST /tracking-events`.
6. Khi giao thanh cong, POD duoc upload qua `/upload/pod` hoac `/upload/multiple-pod`, sau do gan vao tracking event/order status.
7. `OrderStateService` ghi tracking event, validate state transition, settle COD neu can, emit notification.
8. Green-tech queue tinh emission sau khi trip hoan tat hoac admin force calculation.
