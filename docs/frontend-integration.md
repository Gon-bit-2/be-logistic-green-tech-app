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

## 8. Những màn có thể tích hợp thêm ngay

Ba nhóm route sau đã được mount vào runtime và có thể tích hợp:

- `/orders`
- `/trips`
- `/analytics`

Lưu ý: hiện tại các nhóm này đi qua `Bearer` mặc định và permission check theo `path + method`, nhưng chưa có role decorator chi tiết riêng ở controller.

### Kinh nghiệm tích hợp Analytics Dashboard

- Các API `/analytics/*` hỗ trợ query param `dateRange` (`7d`, `30d`, `90d`, `1y`). Frontend nên có một dropdown chọn khoảng thời gian chung và đồng bộ query này tới tất cả các API đang fetch trên màn hình.
- Dữ liệu từ `/analytics/orders` và `/analytics/emissions` trả về mảng time-series (có trường `period`), được thiết kế để truyền thẳng vào các thư viện biểu đồ như Recharts hoặc Chart.js để hiển thị xu hướng.
- Dữ liệu từ `/analytics/fleet-performance` trả về mảng theo từng xe, phù hợp cho table dashboard hoặc biểu đồ bar ngang (horizontal bar chart) so sánh hiệu suất giữa các phương tiện.

## 9. Caveat runtime cần biết

1. Auth enforcement hiện là `Bearer by default`, nên frontend phải coi mọi route không-public là private kể cả khi docs endpoint chưa gắn `@Auth(...)` riêng.
2. Với route private, `403` có thể đến từ permission lookup của backend chứ không chỉ từ role decorator; frontend nên tách cách xử lý `401` và `403`.
3. `POST /hubs/:id/staff` trả raw Prisma record; frontend chỉ nên dùng field an toàn.
4. `LanguageService` hiện map lỗi nghiệp vụ sang `404` và `409`, nên frontend nên handle các status này đúng nghĩa.
5. `POST /payments/webhook` đã có raw body support ở backend; frontend/public client không cần gọi route này trực tiếp.

## 10. Tài liệu liên quan

- API reference chi tiết: [api-reference.md](./api-reference.md)
