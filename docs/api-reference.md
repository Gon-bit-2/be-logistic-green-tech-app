# Backend API reference

Backend không dùng global prefix `/api`. Frontend gọi trực tiếp theo base URL, ví dụ `http://localhost:8386/orders`.

## Nhóm API chính

- `auth`: đăng ký, đăng nhập, refresh token, Google OAuth, profile, address book.
- `orders`: tạo đơn, quote, list/detail, cập nhật hoặc hủy đơn.
- `payments`: Stripe, COD, webhook và trạng thái thanh toán.
- `trips`: dispatch, trip list/detail, gán xe, thêm đơn, tracking trạng thái chuyến.
- `tracking-events`: timeline nội bộ/public, POD, cập nhật trạng thái đơn.
- `notifications`: inbox, unread count, mark read.
- `analytics`: dashboard, fleet, order, emission analytics.
- `vehicles`, `hubs`, `language`, `role-requests`, `upload`, `wallet`, `green-tech`.

## Data flow chính

1. `orders/quote` tính phí, route và CO2 dự kiến.
2. `orders` tạo order kèm payment record `STRIPE` hoặc `COD`.
3. `payments` hoàn tất online payment hoặc giữ COD pending.
4. `trips/dispatch-preview` hoặc `trips/dispatch-approve` gom order thành trip.
5. Driver cập nhật tracking/POD qua `tracking-events`.
6. Tracking service cập nhật order status, hoàn tất trip khi mọi order xong.
7. Notification listener phát thông báo cho customer.
8. Green-tech queue tính emission sau khi trip hoàn tất.

## Error contract

Mọi lỗi HTTP đi qua `AllExceptionsFilter`. Frontend nên đọc:

- `statusCode`: HTTP status.
- `message`: thông điệp hiển thị hoặc machine code.
- `errorCode`: optional machine code ổn định.
- `requestId`: mã đối chiếu log.
- `errors`: chi tiết validation hoặc lỗi service.

## Realtime tracking

Namespace Socket.IO: `/tracking`.

Client phải gửi token:

```ts
io(`${API_BASE_URL}/tracking`, {
  auth: { token: accessToken },
  transports: ["websocket"],
})
```

Events chính:

- `joinTripTracking`: join room `trip_{id}` nếu có quyền.
- `leaveTripTracking`: rời room.
- `driverLocationUpdate`: driver gửi GPS.
- `locationUpdated`: server broadcast GPS cho room.
- `dashboard.tripCreated`: dashboard refresh danh sách vận hành.
