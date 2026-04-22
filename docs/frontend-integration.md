# Frontend Integration Guide

Tài liệu này tập trung vào cách frontend web tích hợp với backend hiện tại.

## 1. Env gợi ý cho frontend

```env
VITE_API_BASE_URL=http://localhost:8386
VITE_GOOGLE_LOGIN_ENABLED=true
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

`STRIPE_PUBLISHABLE_KEY` không có trong backend repo này, nên cần lấy riêng từ môi trường deploy hoặc backend/ops.

## 2. Auth strategy

### Token storage

- Lưu `accessToken`
- Lưu `refreshToken`
- Mỗi request private gắn:

```http
Authorization: Bearer <accessToken>
```

Toàn bộ route private hiện được bảo vệ theo mặc định bằng `Bearer`, trừ các route backend gắn `@isPublic()`.
Sau bước verify token, backend còn check permission theo `role + path + method`. Kể từ phiên bản mới, `ResourceAccessGuard` cũng được áp dụng (RLA). Một user đăng nhập hợp lệ vẫn có thể nhận `403` nếu khác quyền sở hữu dữ liệu (Ví dụ truy cập đơn hàng của người khác).

### Đọc thông tin User (Role) ở Client

Payload JWT hiện tại trả về trực tiếp thông tin role của User:

```ts
export interface AccessTokenPayload {
  userId: number
  deviceId: number
  roleId: number
  roleName: string // VD: "CUSTOMER", "WAREHOUSE_STAFF"
  exp: number
  iat: number
}
```

**Khuyến nghị:**

- Frontend nên dùng thư viện như `jwt-decode` để parse trực tiếp `accessToken` và lấy `roleName` phục vụ việc rẽ nhánh UI (hiển thị menu Admin, Customer, v.v) thay vì gọi thêm API.
- Để lấy chi tiết hơn (như họ tên, email, avatar, hubId, v.v), sử dụng endpoint `GET /auth/profile`.

### Refresh strategy

- Khi gặp `401`, gọi `POST /auth/refresh-token`
- Body:

```json
{
  "refreshToken": "..."
}
```

- Sau khi refresh thành công, phải cập nhật lại:
  - `accessToken`
  - `refreshToken`

### Logout

- Gọi `POST /auth/logout`
- Body:

```json
{
  "refreshToken": "..."
}
```

## 3. Luồng auth nên triển khai

### Register

1. `POST /auth/otp` với `type=REGISTER`
2. User nhập OTP
3. `POST /auth/register`
4. Chuyển sang màn login

### Forgot password

1. `POST /auth/otp` với `type=FORGOT_PASSWORD`
2. User nhập OTP
3. `POST /auth/forgot-password`

### Google login

1. `GET /auth/google-link`
2. Redirect browser sang `url`
3. Sau callback, frontend đọc query params:
   - `accessToken`
   - `refreshToken`
   - hoặc `errorMessage`

## 4. Axios setup mẫu

```ts
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken')
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})
```

Refresh interceptor gợi ý:

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status !== 401 || originalRequest?._retry) {
      throw error
    }

    originalRequest._retry = true

    const refreshToken = localStorage.getItem('refreshToken')
    const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh-token`, { refreshToken })

    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)

    originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
    return api(originalRequest)
  },
)
```

## 5. Error handling

Backend hiện chưa đồng nhất error response. `message` có thể là:

- string
- array validation issues
- object

Frontend nên normalize:

```ts
export function extractApiMessage(error: any): string {
  const message = error?.response?.data?.message

  if (typeof message === 'string') return message
  if (Array.isArray(message)) {
    return message.map((item) => item?.message ?? String(item)).join(', ')
  }
  if (message && typeof message === 'object') {
    return message.message ?? JSON.stringify(message)
  }

  return 'Request failed'
}
```

## 6. Enum quan trọng cho UI

### VerificationCodeType

- `REGISTER`
- `FORGOT_PASSWORD`
- `LOGIN`

### VehicleType

- `VAN`
- `TRUCK`
- `ELECTRIC_VAN`
- `MOTORCYCLE`

### FuelType

- `DIESEL`
- `ELECTRIC`
- `GASOLINE`

### OrderStatus

- `PENDING`
- `ASSIGNED`
- `PICKED_UP`
- `IN_TRANSIT`
- `ARRIVED_AT_HUB`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `CANCELLED`

### TrackingEventType

- `STATUS_CHANGE`
- `SCAN`
- `NOTE`
- `POD`
- `EXCEPTION`
- `ETA_UPDATE`

### PaymentStatus

- `PENDING`
- `COMPLETED`
- `FAILED`
- `REFUNDED`

## 7. Màn hình frontend có thể triển khai ngay

### Public

- Login
- Register
- Forgot password
- Public tracking theo `trackingCode`

### Customer

- Tạo và theo dõi order qua `/orders`
- Thanh toán Stripe cho order đã có backend support
- Xem payment status theo `orderId`

#### Contract payment FE cần hiểu đúng

- `POST /payments/create-intent/:orderId` trả về `{ clientSecret, transactionId, amount }`.
- `amount` là số tiền VND nguyên đã được backend chuẩn hóa để phù hợp với Stripe `currency = vnd`.
- FE không nên tự tính lại amount từ `shippingFee` ở UI rồi gửi sang Stripe; luôn dùng `clientSecret` backend trả về để confirm payment.
- Nếu UI đang hiển thị `shippingFee` từ order detail, nên format như VND nguyên khi đi vào bước thanh toán để tránh lệch với `amount` thực tế được tạo ở backend.
- Với dữ liệu order cũ có `shippingFee` dạng thập phân, backend sẽ tự làm tròn. Ví dụ `26089.8` sẽ được payment flow dùng thành `26090`.

#### Contract tạo order và tính giá FE phải dùng đúng

Trước khi tạo order, FE nên gọi `POST /orders/quote` để lấy trước giá cước (`shippingFee`), khoảng cách, và đường đi thực tế trên bản đồ (polyline) để hiển thị cho user.

Payload `POST /orders/quote` và `POST /orders` rất giống nhau. Thay vì tính bằng công thức mock phía client, FE hãy gửi payload lên `/orders/quote`.

Frontend hiện phải gọi `POST /orders` theo contract backend mới, không còn dùng payload kiểu `pickupAddress` hay `serviceTier` trực tiếp.

Payload mẫu:

```json
{
  "senderName": "Nguyen Van A",
  "senderPhone": "0900000000",
  "senderAddress": "123 Nguyen Trai, Quan 1, TP HCM",
  "senderLat": 10.776889,
  "senderLng": 106.700806,
  "receiverName": "Tran Thi B",
  "receiverPhone": "0911111111",
  "receiverAddress": "456 Le Loi, Quan 1, TP HCM",
  "receiverLat": 10.773118,
  "receiverLng": 106.698299,
  "preferredDeliveryTimeStart": "2026-04-21T08:00:00.000Z",
  "preferredDeliveryTimeEnd": "2026-04-21T12:00:00.000Z",
  "serviceType": "STANDARD",
  "items": [
    {
      "name": "Ao thun",
      "quantity": 2,
      "weight": 0.3,
      "length": 30,
      "width": 20,
      "height": 5
    }
  ]
}
```

Những điểm FE cần lưu ý:

- `senderLat`, `senderLng`, `receiverLat`, `receiverLng` là bắt buộc và phải gửi dưới dạng number.
- `items` là bắt buộc và phải có ít nhất 1 item.
- Nếu UI hiện chỉ có 1 mô tả hàng hóa, FE vẫn phải map nó vào mảng `items`, ví dụ `[{ name: itemDescription, quantity: 1, weight: packageWeightKg }]`.
- `serviceType` chỉ nhận `EXPRESS`, `STANDARD`, `ECO_GREEN`.
- Nếu không có nhu cầu chọn time window, FE có thể bỏ `preferredDeliveryTimeStart` và `preferredDeliveryTimeEnd`.

Gợi ý mapping từ form FE cũ sang backend:

- `pickupAddress` -> `senderAddress`
- `deliveryAddress` -> `receiverAddress`
- `contactName` -> `senderName`
- `contactPhone` -> `senderPhone`
- `receiverName` -> `receiverName`
- `receiverPhone` -> `receiverPhone`
- `estimatedArrival` -> `preferredDeliveryTimeEnd` hoặc tách ra thành `preferredDeliveryTimeStart` và `preferredDeliveryTimeEnd` theo UX mới
- `serviceTier` -> `serviceType`
- `itemDescription` -> `items[0].name`
- `packageWeightKg` -> `items[0].weight`
- `packageDimensions` -> `items[0].length`, `items[0].width`, `items[0].height`

Những field sau không được backend nhận trực tiếp ở `POST /orders`:

- `customerName`
- `pickupAddress`
- `deliveryAddress`
- `contactName`
- `contactPhone`
- `estimatedArrival`
- `packageWeightKg`
- `packageDimensions`
- `declaredValueUsd`
- `serviceTier`
- `itemDescription`

### Admin

- CRUD vehicles
- CRUD hubs
- Gán / gỡ staff khỏi hub
- CRUD language
- Xem và cập nhật order/trip ở các màn vận hành nội bộ
- Force calculate emission
- Xem emission log theo trip
- Xem dashboard thống kê tổng quan (Analytics)

### Driver / Warehouse

- Tạo tracking event
- Xem timeline tracking nội bộ
- Driver confirm COD
- Theo dõi danh sách trip nội bộ qua `/trips`
- Gửi role request qua `/role-requests`
- Xem inbox notification qua `/notifications`

## 8. Những màn có thể tích hợp thêm ngay

Ba nhóm route sau đã được mount vào runtime và có thể tích hợp:

- `/orders`
- `/trips`
- `/analytics`
- `/notifications`
- `/role-requests`

Lưu ý: hiện tại các nhóm này đi qua `Bearer` mặc định và permission check theo `path + method`, nhưng chưa có role decorator chi tiết riêng ở controller.

### Kinh nghiệm tích hợp Analytics Dashboard

- Các API `/analytics/*` hỗ trợ query param `dateRange` (`7d`, `30d`, `90d`, `1y`). Frontend nên có một dropdown chọn khoảng thời gian chung và đồng bộ query này tới tất cả các API đang fetch trên màn hình.
- Dữ liệu từ `/analytics/orders` và `/analytics/emissions` trả về mảng time-series (có trường `period`), được thiết kế để truyền thẳng vào các thư viện biểu đồ như Recharts hoặc Chart.js để hiển thị xu hướng.
- Dữ liệu từ `/analytics/fleet-performance` trả về mảng theo từng xe, phù hợp cho table dashboard hoặc biểu đồ bar ngang (horizontal bar chart) so sánh hiệu suất giữa các phương tiện.

### Kinh nghiệm tích hợp Role Request + Notifications

- Với user thường, frontend có thể hiển thị form đơn giản gồm `targetRoleName` và `reason`, gọi `POST /role-requests`.
- Để render lịch sử request của user hiện tại, dùng `GET /role-requests/me` với pagination chuẩn `page`, `limit`.
- Với admin, màn review có thể lấy queue từ `GET /role-requests?status=PENDING`.
- Nếu admin duyệt request lên `WAREHOUSE_STAFF`, frontend phải gửi thêm `hubId` trong `PATCH /role-requests/:id/approve`.
- Inbox notification nên poll `GET /notifications/unread-count` ở header/bell icon và fetch `GET /notifications` khi mở danh sách.
- Khi user mở 1 item notification, gọi `PATCH /notifications/:id/read`; khi mở toàn bộ inbox, có thể dùng `PATCH /notifications/read-all`.
- Notification của flow role-request hiện được tạo qua backend event listener, nên FE nên coi notification là side-effect độc lập với response của `POST /role-requests` và `PATCH /role-requests/:id/approve|reject`.
- Inbox hiện có thể chứa thêm notification cho order với các type: `ORDER_CREATED`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`.
- FE nên render payload order theo các field `orderId`, `trackingCode`, `orderStatus`.

## 9. Caveat runtime cần biết

1. Auth enforcement hiện là `Bearer by default`, nên frontend phải coi mọi route không-public là private kể cả khi docs endpoint chưa gắn `@Auth(...)` riêng.
2. Với route private, `403` có thể đến từ permission lookup của backend chứ không chỉ từ role decorator; frontend nên tách cách xử lý `401` và `403`.
3. `POST /hubs/:id/staff` trả raw Prisma record; frontend chỉ nên dùng field an toàn.
4. `LanguageService` hiện map lỗi nghiệp vụ sang `404` và `409`, nên frontend nên handle các status này đúng nghĩa.
5. `POST /payments/webhook` là route server-to-server; frontend/public client không cần gọi route này trực tiếp.
6. `amount` trong payment response là nguồn sự thật cho checkout Stripe; không giả định nó luôn bằng raw `shippingFee` chưa format trên màn hình.
7. `POST /role-requests` sẽ bị từ chối nếu user đang có một request `PENDING`.
8. `PATCH /role-requests/:id/approve` yêu cầu `hubId` khi target role là `WAREHOUSE_STAFF`.
9. Nếu môi trường deploy chưa chạy migration `20260420_add_role_requests_notifications`, các màn `/notifications` và `/role-requests` sẽ fail do thiếu bảng DB tương ứng.
10. Nếu môi trường deploy chưa chạy migration `20260420_add_order_notifications`, notification type cho order sẽ chưa ghi được vào DB.

## 10. Tài liệu liên quan

- API reference chi tiết: [api-reference.md](./api-reference.md)

## 11. Luồng UI gợi ý cho Role Request

### User thường

1. Render CTA "Đăng ký làm tài xế" hoặc "Đăng ký làm nhân viên kho".
2. Submit `POST /role-requests`.
3. Refresh lịch sử bằng `GET /role-requests/me`.
4. Poll `GET /notifications/unread-count` để biết khi nào request được xử lý.

### Admin

1. Load danh sách chờ duyệt bằng `GET /role-requests?status=PENDING`.
2. Với request `DRIVER`, gọi `PATCH /role-requests/:id/approve` chỉ với `reviewNote` nếu cần.
3. Với request `WAREHOUSE_STAFF`, bắt buộc chọn hub rồi gửi `hubId`.
4. Nếu từ chối, gọi `PATCH /role-requests/:id/reject` với `reviewNote`.
5. Sau thao tác, refresh cả queue review lẫn unread count nếu admin có inbox mở.


## 5. WebSockets Integration (Tracking Gateway)
Để hiển thị thời gian thực vị trí tài xế, Frontend cần kết nối Socket.io với Gateway `/tracking`.

**1. Setup Client**
```typescript
import { io } from "socket.io-client";

// Đảm bảo include token vào "auth"
const socket = io("http://localhost:8386/tracking", {
  auth: {
    token: "Bearer <accessToken>"
  }
});
```

**2. Subscribe/Nhận Dữ Liệu (Dành cho Khách Hàng)**
```typescript
// Join vào room trip cụ thể
socket.emit("joinTripTracking", { tripId: 1001 });

// Lắng nghe thay đổi vị trí
socket.on("locationUpdated", (data) => {
  console.log("GPS mới từ driver:", data.lat, data.lng);
});

// Khi rời trang
socket.emit("leaveTripTracking", { tripId: 1001 });
```

**3. Publish/Cập nhật vị trí (Dành cho Tài Xế)**
```typescript
// Driver update GPS liên tục
socket.emit("driverLocationUpdate", {
  tripId: 1001,
  lat: 10.762622,
  lng: 106.660172
});
```

## 12. Maps Integration (Goong API Proxy)

Tất cả các tính năng bản đồ và địa lý của Frontend phải gọi qua backend, **KHÔNG GỌI TRỰC TIẾP LÊN GOONG API**. Backend sẽ chịu trách nhiệm gắn API Key.

**Các endpoint chính:**
- Autocomplete tìm kiếm địa chỉ: `GET /maps/places/autocomplete?input=Hanoi`
- Lấy chi tiết một địa chỉ: `GET /maps/places/detail?placeid=...`
- Lấy tọa độ từ text (Geocoding): `GET /maps/geocode?address=...` hoặc `GET /maps/geocode?latlng=...,...`
- Chỉ đường (Directions): `POST /maps/directions`

**Payload cho `POST /maps/directions`:**
```json
{
  "origin": "10.776889,106.700806",
  "destination": "10.773118,106.698299",
  "vehicle": "car"
}
```

Response của Backend cho `/maps` giữ nguyên format của Goong API để Frontend dễ dàng parse data (polyline, distance, duration).
