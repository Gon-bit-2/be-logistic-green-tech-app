# API Reference

Tài liệu này được viết từ source backend hiện tại tại ngày `2026-04-21`.

## Tổng quan runtime

- Base URL local: `http://localhost:8386`
- Không có prefix `/api`
- CORS bật toàn cục
- `GET /` là public
- Auth mặc định là `Bearer` cho mọi route, trừ các route có `@isPublic()`
- Với route `Bearer`, runtime hiện tại còn check permission theo `role + path + method` trong DB/cache
- Có cơ chế **Resource Level Authorization (RLA)** sử dụng Guard `@ResourceAccess`:
  - CUSTOMER và DRIVER chỉ được thao tác với dữ liệu của nình (VD: check `customerId`).
  - WAREHOUSE_STAFF chỉ được thao tác với dữ liệu thuộc kho mình quản lý (VD: check `currentHubId`).
- Response là JSON, `Date` serialize thành ISO string
- Pagination chuẩn:
  - `page`: mặc định `1`
  - `limit`: mặc định `10`
  - `limit`: tối đa `100`

## API đang được mount

Các module đang được import trong `src/app.module.ts`:

- `auth`
- `vehicles`
- `hubs`
- `language`
- `tracking-events`
- `green-tech`
- `payments`
- `orders`
- `trips`
- `analytics`
- `upload` (Cloudinary Cloud - POD)
- `wallet` (COD Reconciliation)
- `notifications`
- `role-requests`

## 1. Auth

Module `auth` đang chịu trách nhiệm cho:

- OTP theo email cho `REGISTER`, `FORGOT_PASSWORD`, `LOGIN`
- đăng ký bằng email/password
- đăng nhập bằng email/password
- Google OAuth login
- lấy và cập nhật profile của chính user hiện tại
- quản lý sổ địa chỉ cá nhân (`address-book`)
- refresh token rotation
- logout theo refresh token

### 1.1 Tổng quan endpoint

| Method | Path                         | Public | Mục đích                              | Response chính                  |
| ------ | ---------------------------- | ------ | ------------------------------------- | ------------------------------- |
| POST   | `/auth/otp`                  | Yes    | Gửi OTP qua email                     | `{ message }`                   |
| POST   | `/auth/verify-otp`           | Yes    | Verify OTP trước khi dùng flow khác   | `{ message }`                   |
| POST   | `/auth/register`             | Yes    | Đăng ký tài khoản customer            | user public                     |
| POST   | `/auth/login`                | Yes    | Đăng nhập bằng email/password         | `{ accessToken, refreshToken }` |
| GET    | `/auth/profile`              | No     | Lấy profile user hiện tại             | user public                     |
| PATCH  | `/auth/profile`              | No     | Cập nhật profile user hiện tại        | user public                     |
| GET    | `/auth/address-book`         | No     | Lấy danh sách địa chỉ của user hiện tại | `{ data }`                    |
| POST   | `/auth/address-book`         | No     | Tạo địa chỉ mới                       | address book item               |
| PATCH  | `/auth/address-book/:id`     | No     | Cập nhật địa chỉ                      | address book item               |
| DELETE | `/auth/address-book/:id`     | No     | Xóa mềm địa chỉ                       | `{ message }`                   |
| POST   | `/auth/refresh-token`        | Yes    | Refresh access token + rotate refresh | `{ accessToken, refreshToken }` |
| POST   | `/auth/logout`               | No     | Logout theo refresh token             | `{ message }`                   |
| GET    | `/auth/google-link`          | Yes    | Lấy URL bắt đầu Google OAuth          | `{ url }`                       |
| GET    | `/auth/google/callback`      | Yes    | Callback redirect từ Google           | `302 redirect`                  |
| POST   | `/auth/forgot-password`      | Yes    | Đổi mật khẩu bằng OTP                 | `{ message }`                   |

### 1.2 Cách authenticate

Với mọi endpoint không public, gửi header:

```http
Authorization: Bearer <access-token>
```

Lưu ý:

- `accessToken` được dùng cho route Bearer thông thường.
- `refreshToken` không dùng trong header, mà được gửi trong body của các route `refresh-token` và `logout`.
- Runtime hiện có thêm `API_KEY_SECRET` và `PAYMENT_API_KEY`, nhưng flow auth chính cho frontend/mobile hiện là JWT Bearer.

### 1.3 OTP

`POST /auth/otp`

Mục đích: gửi mã OTP qua email.

Body:

```json
{
  "email": "user@example.com",
  "type": "REGISTER"
}
```

`type` hợp lệ:

- `REGISTER`
- `FORGOT_PASSWORD`
- `LOGIN`

Response:

```json
{
  "message": "Gửi Mã Otp thành công"
}
```

Behavior note:

- Bị throttle `1 request / 60s`.
- Với `REGISTER`, email đã tồn tại sẽ bị từ chối.
- Với `FORGOT_PASSWORD`, email không tồn tại sẽ bị từ chối.

`POST /auth/verify-otp`

Body:

```json
{
  "email": "user@example.com",
  "code": "123456",
  "type": "REGISTER"
}
```

Response:

```json
{
  "message": "Mã OTP hợp lệ"
}
```

### 1.4 Đăng ký

`POST /auth/register`

Body:

```json
{
  "email": "user@example.com",
  "password": "Secret123",
  "confirmPassword": "Secret123",
  "fullName": "Nguyen Van A",
  "phone": "0900000000",
  "code": "123456"
}
```

Response mẫu:

```json
{
  "id": 12,
  "email": "user@example.com",
  "fullName": "Nguyen Van A",
  "phone": "0900000000",
  "avatar": null,
  "isDeleted": false,
  "roleId": 2,
  "hubId": null,
  "createdById": null,
  "updatedById": null,
  "deletedAt": null,
  "createdAt": "2026-04-21T08:00:00.000Z",
  "updatedAt": "2026-04-21T08:00:00.000Z"
}
```

Behavior note:

- Backend validate `confirmPassword === password`.
- OTP phải đúng và chưa hết hạn.
- User mới được gán role customer mặc định từ bảng role.

### 1.5 Đăng nhập

`POST /auth/login`

Body cơ bản:

```json
{
  "email": "user@example.com",
  "password": "Secret123"
}
```

Nếu account đã bật xác thực bổ sung bằng OTP email, body có thể cần thêm:

```json
{
  "email": "user@example.com",
  "password": "Secret123",
  "code": "123456"
}
```

Response:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

Behavior note:

- Hệ thống tạo `device` mới theo mỗi lần login với `userAgent` và `ip`.
- Nếu email không tồn tại hoặc password sai, backend trả lỗi validation.
- Nếu account có `totpSecret`, login hiện yêu cầu thêm `code`.

### 1.6 Profile hiện tại

`GET /auth/profile`

Mục đích: lấy thông tin user hiện đang đăng nhập.

Response mẫu:

```json
{
  "id": 12,
  "email": "user@example.com",
  "fullName": "Nguyen Van A",
  "phone": "0900000000",
  "avatar": null,
  "isDeleted": false,
  "roleId": 2,
  "hubId": null,
  "createdById": null,
  "updatedById": null,
  "deletedAt": null,
  "createdAt": "2026-04-21T08:00:00.000Z",
  "updatedAt": "2026-04-21T08:00:00.000Z"
}
```

`PATCH /auth/profile`

Mục đích: cập nhật thông tin cá nhân của chính user hiện tại.

Body:

```json
{
  "fullName": "Nguyen Van B",
  "phone": "0988888888",
  "avatar": "https://cdn.example.com/avatar/user-12.jpg"
}
```

Quy tắc:

- Cho phép cập nhật một phần.
- Ít nhất phải có một field trong `fullName`, `phone`, `avatar`.
- Backend tự set `updatedById = userId hiện tại`.

Response mẫu:

```json
{
  "id": 12,
  "email": "user@example.com",
  "fullName": "Nguyen Van B",
  "phone": "0988888888",
  "avatar": "https://cdn.example.com/avatar/user-12.jpg",
  "isDeleted": false,
  "roleId": 2,
  "hubId": null,
  "createdById": null,
  "updatedById": 12,
  "deletedAt": null,
  "createdAt": "2026-04-21T08:00:00.000Z",
  "updatedAt": "2026-04-21T08:15:00.000Z"
}
```

### 1.7 Address Book

`address-book` là sổ địa chỉ cá nhân của user hiện tại. Backend đang lưu bằng bảng riêng `address_books` và chỉ thao tác trên record chưa bị soft-delete.

Shape response của một item:

```json
{
  "id": 21,
  "userId": 12,
  "label": "Home",
  "contactName": "Nguyen Van B",
  "phone": "0988888888",
  "address": "123 Nguyen Trai, Quan 1, HCM",
  "latitude": 10.7769,
  "longitude": 106.7009,
  "isDefault": true,
  "createdAt": "2026-04-21T08:20:00.000Z",
  "updatedAt": "2026-04-21T08:20:00.000Z",
  "deletedAt": null
}
```

`GET /auth/address-book`

Response:

```json
{
  "data": [
    {
      "id": 21,
      "userId": 12,
      "label": "Home",
      "contactName": "Nguyen Van B",
      "phone": "0988888888",
      "address": "123 Nguyen Trai, Quan 1, HCM",
      "latitude": 10.7769,
      "longitude": 106.7009,
      "isDefault": true,
      "createdAt": "2026-04-21T08:20:00.000Z",
      "updatedAt": "2026-04-21T08:20:00.000Z",
      "deletedAt": null
    }
  ]
}
```

`POST /auth/address-book`

Body:

```json
{
  "label": "Office",
  "contactName": "Nguyen Van B",
  "phone": "0988888888",
  "address": "456 Le Loi, Quan 3, HCM",
  "latitude": 10.782,
  "longitude": 106.695,
  "isDefault": false
}
```

Lưu ý:

- `label`, `latitude`, `longitude`, `isDefault` là optional.
- Nếu đây là địa chỉ đầu tiên của user, backend tự set `isDefault = true`.
- Nếu gửi `isDefault = true`, backend sẽ bỏ default của các địa chỉ khác của cùng user.

`PATCH /auth/address-book/:id`

Body:

```json
{
  "label": "Warehouse pickup",
  "isDefault": true
}
```

Lưu ý:

- Cho phép cập nhật từng phần.
- Ít nhất phải có một field.
- Chỉ được sửa địa chỉ thuộc chính user hiện tại.
- Nếu set `isDefault = true`, các địa chỉ active khác của user sẽ bị unset default.

`DELETE /auth/address-book/:id`

Response:

```json
{
  "message": "Xóa địa chỉ thành công"
}
```

Lưu ý:

- Đây là soft delete, không xóa cứng record.
- Nếu xóa địa chỉ đang là default, backend sẽ chọn một địa chỉ active khác của cùng user để nâng lên default nếu còn.
- Nếu `:id` không thuộc user hiện tại hoặc không tồn tại active record, backend trả `404`.

### 1.8 Refresh Token

`POST /auth/refresh-token`

Body:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Response:

```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

Behavior note:

- Refresh flow dùng token rotation.
- Mỗi lần refresh thành công, refresh token cũ bị xóa và token mới được tạo lại trong DB.
- Frontend phải ghi đè cả `accessToken` lẫn `refreshToken` sau mỗi lần refresh.
- Nếu refresh token không còn trong DB, backend xem như đã bị dùng/revoke và trả `401`.

### 1.9 Logout

`POST /auth/logout`

Body:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Response:

```json
{
  "message": "Đăng Xuất Thành Công"
}
```

Behavior note:

- Backend verify refresh token trước khi xóa.
- Refresh token bị xóa khỏi DB.
- Device tương ứng bị set `isActive = false`.

### 1.10 Google OAuth

`GET /auth/google-link`

Response:

```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

`GET /auth/google/callback`

Mục đích:

- nhận callback từ Google
- tạo hoặc tìm user theo email Google
- sinh token nội bộ
- redirect về `GOOGLE_CLIENT_REDIRECT_URI`

Backend không trả JSON cho route này. Thay vào đó, redirect `302` với query string:

- thành công: `accessToken`, `refreshToken`
- thất bại: `errorMessage`

Ví dụ:

```text
http://localhost:3000/auth/google/callback?accessToken=...&refreshToken=...
```

hoặc:

```text
http://localhost:3000/auth/google/callback?errorMessage=Thi%E1%BA%BFu+m%C3%A3+x%C3%A1c+th%E1%BB%B1c+t%E1%BB%AB+Google
```

### 1.11 Quên mật khẩu

`POST /auth/forgot-password`

Body:

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecret123",
  "confirmNewPassword": "NewSecret123"
}
```

Response:

```json
{
  "message": "Đổi Mật Khẩu Thành Công"
}
```

Behavior note:

- Chỉ hoạt động khi email tồn tại.
- OTP phải thuộc loại `FORGOT_PASSWORD`.
- Sau khi đổi mật khẩu thành công, record OTP tương ứng bị xóa.

### 1.12 Các lỗi thường gặp

Các status code thực tế trong module này hiện chủ yếu là:

- `200` hoặc `201` cho request thành công
- `401` khi token không hợp lệ hoặc refresh token đã bị dùng
- `404` khi address-book item không tồn tại hoặc không thuộc user
- `422` cho lỗi validation nghiệp vụ như OTP sai/hết hạn, email không tồn tại, password sai

Một số message đang xuất hiện trực tiếp từ service:

- `Mã OTP không hợp lệ`
- `Mã OTP đã hết hạn`
- `Email đã tồn tại`
- `Email không tồn tại`
- `Email Không Tồn Tại`
- `Mật Khẩu Không Đúng`
- `Refresh Token đã sử dụng`
- `Address book entry not found`

## 2. Vehicles

| Method | Path            | Quyền dự kiến | Mục đích     | Response chính          |
| ------ | --------------- | ------------- | ------------ | ----------------------- |
| GET    | `/vehicles`     | ADMIN         | Danh sách xe | `{ data, totalItems }`  |
| POST   | `/vehicles`     | ADMIN         | Tạo xe       | vehicle                 |
| GET    | `/vehicles/:id` | ADMIN         | Chi tiết xe  | vehicle                 |
| PATCH  | `/vehicles/:id` | ADMIN         | Cập nhật xe  | vehicle                 |
| DELETE | `/vehicles/:id` | ADMIN         | Xóa mềm xe   | vehicle sau soft-delete |

Query của `GET /vehicles`:

- `page`
- `limit`
- `type`: `VAN | TRUCK | ELECTRIC_VAN | MOTORCYCLE`
- `fuelType`: `DIESEL | ELECTRIC | GASOLINE`
- `isActive`
- `search`

Body tạo xe:

```json
{
  "licensePlate": "51A-12345",
  "type": "TRUCK",
  "fuelType": "DIESEL",
  "capacityWeight": 1500,
  "capacityVolume": 12,
  "emissionRatePerKm": 250,
  "hubId": 1
}
```

## 3. Hubs

| Method | Path                      | Quyền dự kiến | Mục đích          | Response chính           |
| ------ | ------------------------- | ------------- | ----------------- | ------------------------ |
| GET    | `/hubs`                   | Authenticated | Danh sách hub     | `{ data, totalItems }`   |
| POST   | `/hubs`                   | ADMIN         | Tạo hub           | hub                      |
| GET    | `/hubs/:id`               | Authenticated | Chi tiết hub      | hub + `staff` + `_count` |
| PATCH  | `/hubs/:id`               | ADMIN         | Cập nhật hub      | hub                      |
| DELETE | `/hubs/:id`               | ADMIN         | Xóa mềm hub       | `{ message }`            |
| POST   | `/hubs/:id/staff`         | ADMIN         | Gán staff vào hub | user record              |
| DELETE | `/hubs/:id/staff/:userId` | ADMIN         | Gỡ staff khỏi hub | `{ message }`            |

Body tạo hub:

```json
{
  "code": "SGN-HUB-01",
  "name": "Tan Binh Hub",
  "address": "123 Nguyen Van Troi, HCM",
  "latitude": 10.801,
  "longitude": 106.667
}
```

Ghi chú:

- `GET /hubs/:id` trả thêm:
  - `staff`: danh sách nhân viên kho
  - `_count.vehicles`: số lượng xe thuộc hub
- Runtime hiện tại của `POST /hubs/:id/staff` trả raw Prisma user record. Frontend chỉ nên rely vào:
  - `id`
  - `email`
  - `fullName`
  - `phone`
  - `hubId`
  - `roleId`

## 4. Language

| Method | Path                    | Quyền dự kiến | Mục đích           | Response chính         |
| ------ | ----------------------- | ------------- | ------------------ | ---------------------- |
| GET    | `/language`             | Authenticated | Danh sách ngôn ngữ | `{ data, totalItems }` |
| POST   | `/language`             | Authenticated | Tạo ngôn ngữ       | language               |
| GET    | `/language/:languageId` | Authenticated | Chi tiết ngôn ngữ  | language               |
| PUT    | `/language/:languageId` | Authenticated | Cập nhật ngôn ngữ  | language               |
| DELETE | `/language/:languageId` | Authenticated | Xóa mềm ngôn ngữ   | `{ message }`          |

Body tạo ngôn ngữ:

```json
{
  "id": "vi",
  "name": "Vietnamese",
  "code": "vi-VN"
}
```

Lưu ý:

- `LanguageService` hiện trả `404` khi không tìm thấy ngôn ngữ và `409` khi tạo trùng mã ngôn ngữ.

## 4.5 Notifications

| Method | Path                          | Quyền dự kiến | Mục đích                    | Response chính         |
| ------ | ----------------------------- | ------------- | --------------------------- | ---------------------- |
| GET    | `/notifications`              | Authenticated | Danh sách inbox             | `{ data, totalItems }` |
| GET    | `/notifications/unread-count` | Authenticated | Đếm thông báo chưa đọc      | `{ totalUnread }`      |
| PATCH  | `/notifications/:id/read`     | Authenticated | Đánh dấu 1 thông báo đã đọc | `{ message }`          |
| PATCH  | `/notifications/read-all`     | Authenticated | Đánh dấu toàn bộ đã đọc     | `{ message }`          |

Query của `GET /notifications`:

- `page`
- `limit`
- `isRead`: `true | false`

Payload notification hiện tại dùng cho role-request tối thiểu gồm:

```json
{
  "roleRequestId": 12,
  "targetRoleName": "DRIVER",
  "status": "PENDING",
  "reviewedById": 1
}
```

Payload notification cho order hiện tối thiểu gồm:

```json
{
  "orderId": 101,
  "trackingCode": "cmabc123xyz",
  "orderStatus": "OUT_FOR_DELIVERY"
}
```

Các `type` notification hiện có:

- `ROLE_REQUEST_SUBMITTED`
- `ROLE_REQUEST_APPROVED`
- `ROLE_REQUEST_REJECTED`
- `ORDER_CREATED`
- `ORDER_OUT_FOR_DELIVERY`
- `ORDER_DELIVERED`
- `ORDER_CANCELLED`

Behavior note:

- Notification cho `role-requests` hiện được tạo qua Nest `EventEmitter` sau khi action nghiệp vụ hoàn tất.
- Notification cho order hiện được tạo qua Nest `EventEmitter` khi tạo đơn thành công hoặc khi đơn chuyển sang `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.
- Việc tạo notification là side-effect tách riêng khỏi transaction chính của `role-request`.
- Nếu notification write thất bại, request tạo/duyệt/từ chối `role-request` hiện không tự rollback chỉ vì lỗi notification.
- Environment phải apply migration `20260420_add_role_requests_notifications` trước khi dùng các endpoint `/notifications`.
- Environment phải apply migration `20260420_add_order_notifications` trước khi dùng các type notification mới cho order.

## 4.6 Role Requests

| Method | Path                         | Quyền dự kiến                       | Mục đích                                | Response chính         |
| ------ | ---------------------------- | ----------------------------------- | --------------------------------------- | ---------------------- |
| POST   | `/role-requests`             | CUSTOMER / DRIVER / WAREHOUSE_STAFF | Gửi yêu cầu đăng ký vai trò mới         | role request detail    |
| GET    | `/role-requests/me`          | CUSTOMER / DRIVER / WAREHOUSE_STAFF | Xem lịch sử request của chính mình      | `{ data, totalItems }` |
| GET    | `/role-requests`             | ADMIN                               | Admin xem danh sách request             | `{ data, totalItems }` |
| PATCH  | `/role-requests/:id/approve` | ADMIN                               | Duyệt request và cập nhật role cho user | role request detail    |
| PATCH  | `/role-requests/:id/reject`  | ADMIN                               | Từ chối request                         | role request detail    |

Body tạo request:

```json
{
  "targetRoleName": "DRIVER",
  "reason": "Tôi muốn đăng ký làm tài xế giao hàng"
}
```

Body approve:

```json
{
  "reviewNote": "Đủ điều kiện",
  "hubId": 1
}
```

Ghi chú:

- Chỉ hỗ trợ target role `DRIVER` và `WAREHOUSE_STAFF`.
- Mỗi user chỉ được có 1 request `PENDING` trên toàn hệ thống.
- Nếu approve `WAREHOUSE_STAFF`, `hubId` là bắt buộc.
- Khi submit request, hệ thống emit event để tạo notification cho admin; khi approve/reject, hệ thống emit event để tạo notification cho requester.
- Notification là side-effect bất đồng bộ theo EventEmitter của Nest, không phải phần response body của API này.
- Environment phải apply migration `20260420_add_role_requests_notifications` trước khi dùng các endpoint `/role-requests`.

## 5. Tracking

### REST APIs

| Method | Path                                    | Quyền dự kiến                    | Mục đích        | Response chính                            |
| ------ | --------------------------------------- | -------------------------------- | --------------- | ----------------------------------------- |
| POST   | `/tracking-events`                      | DRIVER / WAREHOUSE_STAFF / ADMIN | Tạo event       | tracking event vừa tạo                    |
| GET    | `/tracking-events?orderId=...`          | Authenticated                    | Timeline nội bộ | `{ trackingCode, currentStatus, events }` |
| GET    | `/tracking-events/public/:trackingCode` | Public                           | Timeline public | `{ trackingCode, currentStatus, events }` |

Body tạo tracking event:

```json
{
  "orderId": 1001,
  "eventType": "STATUS_CHANGE",
  "status": "OUT_FOR_DELIVERY",
  "source": "DRIVER_APP",
  "latitude": 10.77,
  "longitude": 106.69,
  "location": "Quan 1, HCM",
  "description": "Tai xe dang giao hang"
}
```

Nếu giao thành công:

```json
{
  "orderId": 1001,
  "eventType": "STATUS_CHANGE",
  "status": "DELIVERED",
  "source": "DRIVER_APP",
  "pod": {
    "receiverName": "Tran Thi B",
    "packageCondition": "INTACT",
    "images": [
      {
        "url": "https://cdn.example.com/pod-1.jpg",
        "type": "PACKAGE"
      }
    ]
  }
}
```

Rule nghiệp vụ REST:

- `STATUS_CHANGE` bắt buộc có `status`
- `EXCEPTION` bắt buộc có `failureReasonCode`
- `status = DELIVERED` bắt buộc có `pod`
- public timeline sẽ ẩn bớt thông tin nhạy cảm

### WebSocket (Real-time Tracking)
Body tạo hub:

```json
{
  "code": "SGN-HUB-01",
  "name": "Tan Binh Hub",
  "address": "123 Nguyen Van Troi, HCM",
  "latitude": 10.801,
  "longitude": 106.667
}
```

Ghi chú:

- `GET /hubs/:id` trả thêm:
  - `staff`: danh sách nhân viên kho
  - `_count.vehicles`: số lượng xe thuộc hub
- Runtime hiện tại của `POST /hubs/:id/staff` trả raw Prisma user record. Frontend chỉ nên rely vào:
  - `id`
  - `email`
  - `fullName`
  - `phone`
  - `hubId`
  - `roleId`

## 4. Language

| Method | Path                    | Quyền dự kiến | Mục đích           | Response chính         |
| ------ | ----------------------- | ------------- | ------------------ | ---------------------- |
| GET    | `/language`             | Authenticated | Danh sách ngôn ngữ | `{ data, totalItems }` |
| POST   | `/language`             | Authenticated | Tạo ngôn ngữ       | language               |
| GET    | `/language/:languageId` | Authenticated | Chi tiết ngôn ngữ  | language               |
| PUT    | `/language/:languageId` | Authenticated | Cập nhật ngôn ngữ  | language               |
| DELETE | `/language/:languageId` | Authenticated | Xóa mềm ngôn ngữ   | `{ message }`          |

Body tạo ngôn ngữ:

```json
{
  "id": "vi",
  "name": "Vietnamese",
  "code": "vi-VN"
}
```

Lưu ý:

- `LanguageService` hiện trả `404` khi không tìm thấy ngôn ngữ và `409` khi tạo trùng mã ngôn ngữ.

## 4.5 Notifications

| Method | Path                          | Quyền dự kiến | Mục đích                    | Response chính         |
| ------ | ----------------------------- | ------------- | --------------------------- | ---------------------- |
| GET    | `/notifications`              | Authenticated | Danh sách inbox             | `{ data, totalItems }` |
| GET    | `/notifications/unread-count` | Authenticated | Đếm thông báo chưa đọc      | `{ totalUnread }`      |
| PATCH  | `/notifications/:id/read`     | Authenticated | Đánh dấu 1 thông báo đã đọc | `{ message }`          |
| PATCH  | `/notifications/read-all`     | Authenticated | Đánh dấu toàn bộ đã đọc     | `{ message }`          |

Query của `GET /notifications`:

- `page`
- `limit`
- `isRead`: `true | false`

Payload notification hiện tại dùng cho role-request tối thiểu gồm:

```json
{
  "roleRequestId": 12,
  "targetRoleName": "DRIVER",
  "status": "PENDING",
  "reviewedById": 1
}
```

Payload notification cho order hiện tối thiểu gồm:

```json
{
  "orderId": 101,
  "trackingCode": "cmabc123xyz",
  "orderStatus": "OUT_FOR_DELIVERY"
}
```

Các `type` notification hiện có:

- `ROLE_REQUEST_SUBMITTED`
- `ROLE_REQUEST_APPROVED`
- `ROLE_REQUEST_REJECTED`
- `ORDER_CREATED`
- `ORDER_OUT_FOR_DELIVERY`
- `ORDER_DELIVERED`
- `ORDER_CANCELLED`

Behavior note:

- Notification cho `role-requests` hiện được tạo qua Nest `EventEmitter` sau khi action nghiệp vụ hoàn tất.
- Notification cho order hiện được tạo qua Nest `EventEmitter` khi tạo đơn thành công hoặc khi đơn chuyển sang `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.
- Việc tạo notification là side-effect tách riêng khỏi transaction chính của `role-request`.
- Nếu notification write thất bại, request tạo/duyệt/từ chối `role-request` hiện không tự rollback chỉ vì lỗi notification.
- Environment phải apply migration `20260420_add_role_requests_notifications` trước khi dùng các endpoint `/notifications`.
- Environment phải apply migration `20260420_add_order_notifications` trước khi dùng các type notification mới cho order.

## 4.6 Role Requests

| Method | Path                         | Quyền dự kiến                       | Mục đích                                | Response chính         |
| ------ | ---------------------------- | ----------------------------------- | --------------------------------------- | ---------------------- |
| POST   | `/role-requests`             | CUSTOMER / DRIVER / WAREHOUSE_STAFF | Gửi yêu cầu đăng ký vai trò mới         | role request detail    |
| GET    | `/role-requests/me`          | CUSTOMER / DRIVER / WAREHOUSE_STAFF | Xem lịch sử request của chính mình      | `{ data, totalItems }` |
| GET    | `/role-requests`             | ADMIN                               | Admin xem danh sách request             | `{ data, totalItems }` |
| PATCH  | `/role-requests/:id/approve` | ADMIN                               | Duyệt request và cập nhật role cho user | role request detail    |
| PATCH  | `/role-requests/:id/reject`  | ADMIN                               | Từ chối request                         | role request detail    |

Body tạo request:

```json
{
  "targetRoleName": "DRIVER",
  "reason": "Tôi muốn đăng ký làm tài xế giao hàng"
}
```

Body approve:

```json
{
  "reviewNote": "Đủ điều kiện",
  "hubId": 1
}
```

Ghi chú:

- Chỉ hỗ trợ target role `DRIVER` và `WAREHOUSE_STAFF`.
- Mỗi user chỉ được có 1 request `PENDING` trên toàn hệ thống.
- Nếu approve `WAREHOUSE_STAFF`, `hubId` là bắt buộc.
- Khi submit request, hệ thống emit event để tạo notification cho admin; khi approve/reject, hệ thống emit event để tạo notification cho requester.
- Notification là side-effect bất đồng bộ theo EventEmitter của Nest, không phải phần response body của API này.
- Environment phải apply migration `20260420_add_role_requests_notifications` trước khi dùng các endpoint `/role-requests`.

## 5. Tracking

### REST APIs

| Method | Path                                    | Quyền dự kiến                    | Mục đích        | Response chính                            |
| ------ | --------------------------------------- | -------------------------------- | --------------- | ----------------------------------------- |
| POST   | `/tracking-events`                      | DRIVER / WAREHOUSE_STAFF / ADMIN | Tạo event       | tracking event vừa tạo                    |
| GET    | `/tracking-events?orderId=...`          | Authenticated                    | Timeline nội bộ | `{ trackingCode, currentStatus, events }` |
| GET    | `/tracking-events/public/:trackingCode` | Public                           | Timeline public | `{ trackingCode, currentStatus, events }` |

Body tạo tracking event:

```json
{
  "orderId": 1001,
  "eventType": "STATUS_CHANGE",
  "status": "OUT_FOR_DELIVERY",
  "source": "DRIVER_APP",
  "latitude": 10.77,
  "longitude": 106.69,
  "location": "Quan 1, HCM",
  "description": "Tai xe dang giao hang"
}
```

Nếu giao thành công:

```json
{
  "orderId": 1001,
  "eventType": "STATUS_CHANGE",
  "status": "DELIVERED",
  "source": "DRIVER_APP",
  "pod": {
    "receiverName": "Tran Thi B",
    "packageCondition": "INTACT",
    "images": [
      {
        "url": "https://cdn.example.com/pod-1.jpg",
        "type": "PACKAGE"
      }
    ]
  }
}
```

Rule nghiệp vụ REST:

- `STATUS_CHANGE` bắt buộc có `status`
- `EXCEPTION` bắt buộc có `failureReasonCode`
- `status = DELIVERED` bắt buộc có `pod`
- public timeline sẽ ẩn bớt thông tin nhạy cảm

### WebSocket (Real-time Tracking)

Namespace: `/tracking`

| Sự kiện (Emit/Subscribe) | Người gửi               | Payload/Data                                   | Chi tiết                                               |
| ------------------------ | ----------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `driverLocationUpdate`   | Driver (Emit)           | `{ tripId: number, lat: number, lng: number }` | Tài xế cập nhật GPS liên tục. Yêu cầu token hợp lệ.    |
| `locationUpdated`        | Server (Broadcast)      | `{ driverId, tripId, lat, lng, timestamp }`    | Server đẩy vị trí về cho tất cả client trong room trip |
| `joinTripTracking`       | Khách / Giám sát (Emit) | `{ tripId: number }`                           | Client tham gia vào room của 1 chuyến đi (trip).       |
| `leaveTripTracking`      | Khách / Giám sát (Emit) | `{ tripId: number }`                           | Rời khỏi room tracking để tiết kiệm tài nguyên.        |

**Lưu ý:**

- Xác thực: `client.handshake.auth.token` hiện được trích xuất thông qua JWT Guard (TODO: `WsGuard`) để map với `AuthenticatedSocket`.
- Cần Emit `joinTripTracking` để bắt đầu nhận dữ liệu từ `locationUpdated`.

## 6. Green Tech

| Method | Path                            | Quyền dự kiến  | Mục đích            | Response chính          |
| ------ | ------------------------------- | -------------- | ------------------- | ----------------------- |
| POST   | `/green-tech/calculate/:tripId` | ADMIN          | Force tính emission | emission log mới        |
| GET    | `/green-tech/trips/:tripId`     | ADMIN / DRIVER | Lịch sử emission    | danh sách emission logs |

Response emission log gồm các field chính:

- `tripId`
- `version`
- `isLatest`
- `actualDistance`
- `payloadWeight`
- `co2Emitted`
- `co2Saved`
- `emissionFactor`
- `baselineRate`
- `vehicleType`
- `fuelType`
- `calculationMethod`
- `ghgScope`
- `calculatedAt`

## 7. Orders

| Method | Path                 | Quyền dự kiến | Mục đích                | Response chính        |
| ------ | -------------------- | ------------- | ----------------------- | --------------------- |
| POST   | `/orders/quote`      | Authenticated | Lấy báo giá và lộ trình | `{ quote, routes }`   |
| POST   | `/orders`            | Authenticated | Tạo đơn hàng            | `{ order }`           |
| GET    | `/orders`            | Authenticated | Danh sách đơn hàng      | `{ data, totalItems}` |
| GET    | `/orders/:id`        | Authenticated | Chi tiết đơn hàng       | order                 |
| PUT    | `/orders/:id/status` | Authenticated | Cập nhật trạng thái đơn | order                 |
| DELETE | `/orders/:id`        | Authenticated | Xóa mềm đơn             | order                 |

Request `POST /orders/quote`:

```json
{
  "senderLat": 10.776889,
  "senderLng": 106.700806,
  "receiverLat": 10.773118,
  "receiverLng": 106.698299,
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

Response `POST /orders/quote`:

```json
{
  "quote": {
    "totalWeight": 0.6,
    "totalVolume": 0.006,
    "shippingFee": 42500,
    "estimatedCo2Saved": 0.0625,
    "distance": 5.2,
    "duration": 1200
  },
  "routes": [
    {
      "distance": { "text": "5.2 km", "value": 5200 },
      "duration": { "text": "20 mins", "value": 1200 },
      "overview_polyline": { "points": "..." }
    }
  ]
}
```

Request `POST /orders`:

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

Field rules:

- `senderName`, `senderPhone`, `senderAddress`, `receiverName`, `receiverPhone`, `receiverAddress` là bắt buộc.
- `senderLat`, `senderLng`, `receiverLat`, `receiverLng` là bắt buộc và phải là JSON number, backend hiện không tự ép kiểu từ string sang number.
- `items` là bắt buộc, phải có ít nhất 1 phần tử.
- Mỗi `item` cần tối thiểu: `name`, `quantity`, `weight`.
- `length`, `width`, `height` là optional, đơn vị hiện tại backend giả định là `cm`.
- `weight` là kg cho từng item; `quantity` là số lượng item đó.
- `serviceType` nhận một trong các giá trị: `EXPRESS`, `STANDARD`, `ECO_GREEN`. Nếu bỏ qua, backend mặc định `STANDARD`.
- `preferredDeliveryTimeStart` và `preferredDeliveryTimeEnd` là optional, nên gửi ISO-8601 string.
- `customerId` chỉ nên dùng khi admin hoặc warehouse staff tạo hộ khách hàng. Customer tự tạo đơn nên bỏ field này để backend lấy từ token.

Không có compatibility alias cho payload cũ:

- Backend hiện không nhận các field kiểu cũ như `customerName`, `pickupAddress`, `deliveryAddress`, `contactName`, `contactPhone`, `estimatedArrival`, `packageWeightKg`, `packageDimensions`, `declaredValueUsd`, `serviceTier`, `itemDescription`.
- Frontend cần map các field UI đó sang contract ở trên trước khi gọi API.

Response `POST /orders`:

```json
{
  "order": {
    "id": 101,
    "trackingCode": "cmabc123xyz",
    "customerId": 25,
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
    "status": "PENDING",
    "serviceType": "STANDARD",
    "totalWeight": 0.6,
    "totalVolume": 0.006,
    "shippingFee": 42500,
    "estimatedCo2Saved": 0.0625,
    "currentHubId": 3,
    "currentTripId": null,
    "preferredDeliveryTimeStart": "2026-04-21T08:00:00.000Z",
    "preferredDeliveryTimeEnd": "2026-04-21T12:00:00.000Z",
    "createdAt": "2026-04-20T12:00:00.000Z",
    "updatedAt": "2026-04-20T12:00:00.000Z",
    "items": [
      {
        "id": 1,
        "orderId": 101,
        "name": "Ao thun",
        "quantity": 2,
        "weight": 0.3,
        "length": 30,
        "width": 20,
        "height": 5
      }
    ]
  }
}
```

Lưu ý:

- Runtime hiện tại bảo vệ nhóm này bằng `Bearer` mặc định.
- Sau khi verify token, request còn phải pass permission check theo `role + path + method`; nếu chưa có permission row tương ứng, API có thể trả `403`.
- Nhóm này chưa gắn role decorator chi tiết riêng ở controller.

## 8. Trips

| Method | Path                               | Quyền dự kiến | Mục đích                            | Response chính        |
| ------ | ---------------------------------- | ------------- | ----------------------------------- | --------------------- |
| POST   | `/trips/manual`                    | ADMIN / STAFF | Tạo chuyến đi thủ công              | trip                  |
| PATCH  | `/trips/:id/vehicle`               | ADMIN / STAFF | Thay đổi phương tiện cho chuyến     | trip                  |
| POST   | `/trips/:id/orders`                | ADMIN / STAFF | Thêm đơn hàng vào chuyến hiện tại   | trip                  |
| POST   | `/trips/auto-dispatch`             | Authenticated | Trigger gom chuyến theo 1 hub / all | `{ message, jobId }`  |
| POST   | `/trips/auto-dispatch/all`         | Authenticated | Trigger gom chuyến toàn hệ thống    | `{ message, jobId }`  |
| GET    | `/trips`                           | Authenticated | Danh sách chuyến                    | `{ data, totalItems}` |
| GET    | `/trips/:id`                       | Authenticated | Chi tiết chuyến                     | trip                  |
| PATCH  | `/trips/:id/status`                | Authenticated | Cập nhật trạng thái chuyến          | trip                  |
| PATCH  | `/trips/:id/cancel-order/:orderId` | Authenticated | Gỡ đơn khỏi chuyến                  | trip / result object  |

Body tạo chuyến thủ công (`POST /trips/manual`):

```json
{
  "vehicleId": 10,
  "driverId": 25,
  "orderIds": [101, 102, 105]
}
```

Body gán/đổi xe cho chuyến (`PATCH /trips/:id/vehicle`):

```json
{
  "vehicleId": 12
}
```

Body thêm đơn hàng vào chuyến (`POST /trips/:id/orders`):

```json
{
  "orderIds": [108, 109]
}
```

Field rules (Manual trips):

- `vehicleId`, `driverId` trong `POST /trips/manual` là bắt buộc, phải là số nguyên dương.
- `orderIds` là mảng các `ID` của đơn hàng (số nguyên dương), bắt buộc phải gửi và có ít nhất 1 phần tử.
- Bắt lỗi tải trọng: Trong `POST /trips/manual`, nếu tổng khối lượng (`totalWeight`) của các đơn hàng truyền lên vượt quá sức chứa (`capacityWeight`) của phương tiện được chọn, API trả về `400 Bad Request`.
- WebSocket: Khi tạo chuyến thành công, một sự kiện `dashboard.tripCreated` sẽ được emit ngay lập tức qua namespace `/tracking` để Frontend (Dashboard) có thể nhận thông báo theo thời gian thực.

Lưu ý:

- Runtime hiện tại bảo vệ nhóm này bằng `Bearer` mặc định.
- Sau khi verify token, request còn phải pass permission check theo `role + path + method`; nếu chưa có permission row tương ứng, API có thể trả `403`.
- Nhóm này chưa gắn role decorator chi tiết riêng ở controller.

## 9. Payments

| Method | Path                               | Quyền dự kiến                               | Mục đích               | Response chính                            |
| ------ | ---------------------------------- | ------------------------------------------- | ---------------------- | ----------------------------------------- |
| POST   | `/payments/create-intent/:orderId` | CUSTOMER                                    | Tạo Stripe intent      | `{ clientSecret, transactionId, amount }` |
| POST   | `/payments/cod-confirm/:orderId`   | DRIVER                                      | Xác nhận COD           | `{ success, message }`                    |
| GET    | `/payments/order/:orderId`         | CUSTOMER / DRIVER / ADMIN / WAREHOUSE_STAFF | Lấy trạng thái payment | payment hoặc `null`                       |
| POST   | `/payments/webhook`                | Public                                      | Stripe callback        | `{ received: true }`                      |

Response `create-intent`:

```json
{
  "clientSecret": "pi_..._secret_...",
  "transactionId": "pi_...",
  "amount": 45000
}
```

Ý nghĩa response:

- `amount` là số tiền VND dạng số nguyên dùng để thanh toán và đối soát payment.
- Vì Stripe coi `vnd` là zero-decimal currency, backend sẽ làm tròn `shippingFee` về VND nguyên trước khi tạo PaymentIntent.
- Với các order cũ đã lưu `shippingFee` dạng thập phân (ví dụ `26089.8`), `create-intent` sẽ trả `amount = 26090`.

Response `cod-confirm`:

```json
{
  "success": true,
  "message": "Đã xác nhận thu hộ tiền mặt (COD) thành công"
}
```

Lưu ý:

- `GET /payments/order/:orderId` có thể trả `null` nếu order chưa có payment record.
- `POST /payments/create-intent/:orderId` chỉ chấp nhận amount hợp lệ sau khi chuẩn hóa về đơn vị VND nguyên.
- `POST /payments/cod-confirm/:orderId` cũng lưu `amount` theo VND nguyên để đồng bộ với Stripe flow và dữ liệu payment.
- Webhook Stripe yêu cầu header `stripe-signature`.
- App bootstrap đã bật `rawBody`, nên webhook Stripe verify signature bằng payload thô từ request.

## 10. Analytics

| Method | Path                           | Quyền dự kiến | Mục đích                                | Response chính                                                                                     |
| ------ | ------------------------------ | ------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/analytics/dashboard`         | ADMIN         | Thống kê tổng quan                      | `{ totalOrders, totalRevenue, totalDistance, totalCo2Saved, avgDeliveryTime, onTimeDeliveryRate }` |
| GET    | `/analytics/orders`            | ADMIN         | Thống kê đơn hàng theo khoảng thời gian | `Array<{ period, count, revenue, avgDeliveryTime }>`                                               |
| GET    | `/analytics/emissions`         | ADMIN         | Thống kê khí thải theo khoảng thời gian | `Array<{ period, co2Emitted, co2Saved, greenTripsCount }>`                                         |
| GET    | `/analytics/fleet-performance` | ADMIN         | Thống kê hiệu suất từng phương tiện     | `Array<{ vehicleId, licensePlate, totalTrips, totalDistance, efficiency, co2Saved }>`              |

**Query parameter (dùng chung cho các endpoint):**

- `dateRange`: enum `'7d' | '30d' | '90d' | '1y'` (mặc định `'30d'`)

## 11. Error format hiện tại

Backend chưa có 1 error envelope thống nhất, frontend nên chịu được cả 3 dạng:

1. `message` là string
2. `message` là array validation issues
3. `message` là object

Ví dụ validation:

```json
{
  "statusCode": 422,
  "message": [
    {
      "message": "Mã OTP không hợp lệ",
      "path": "code"
    }
  ],
  "error": "Unprocessable Entity"
}
```

## 12. Runtime notes

- `GET /hubs` chỉ trả hub đang active và chưa soft-delete.
- `LanguageService` dùng `404` cho not found và `409` cho duplicate create thay vì generic `500`.
- `POST /hubs/:id/staff` vẫn trả raw Prisma record; frontend chỉ nên dùng các field an toàn đã liệt kê ở phần Hub.
- Các route private hiện phụ thuộc cả JWT hợp lệ lẫn permission record theo `path + method`.

## 12. Upload & Wallet (New Components)

### W.1 Upload (POD)

| Method | Path                   | Giới hạn      | Multipart form-data   | Chi tiết                        |
| ------ | ---------------------- | ------------- | --------------------- | ------------------------------- |
| POST   | `/upload/pod`          | auth required | `file` (single)       | Tải lên 1 ảnh POD               |
| POST   | `/upload/multiple-pod` | auth required | `files` (array max 5) | Tải lên nhiểu ảnh POD hàng loạt |

- Upload hiện tích hợp Cloudinary `streamifier`.
- Yêu cầu định dạng image hợp lệ (`/jpg/jpeg/png/webp/gif/`).

### W.2 Wallet (COD Storage)

Hệ thống tạo `Wallet` để lưu trữ đối soát số tiền thu được từ COD của tài xế. Module hoạt động đằng sau theo các API internal service.

- Function: `walletRepository.addCodToWallet(userId, amount)`
- Function: `walletRepository.reconcileCod(userId, amount)` (Đối soát / Thu hồi nợ COD)

## 13. Maps (Goong API Proxy)

| Method | Path | Quyền dự kiến | Mục đích | Response chính |
| --- | --- | --- | --- | --- |
| GET | `/maps/places/autocomplete` | Authenticated | Gợi ý địa chỉ từ text | `{ predictions: [...] }` |
| GET | `/maps/places/detail` | Authenticated | Lấy chi tiết địa điểm (Place ID) | `{ result: {...} }` |
| GET | `/maps/geocode` | Authenticated | Lấy tọa độ từ địa chỉ / địa chỉ từ tọa độ | `{ results: [...] }` |
| POST | `/maps/directions` | Authenticated | Lấy lộ trình giữa 2 điểm | `{ routes: [...] }` |

**Chú ý quan trọng:**
- Các API Maps được proxy qua Backend để giấu API Key của Goong. Frontend tuyệt đối không gọi trực tiếp API Goong từ trình duyệt.
- Dữ liệu trả về tuân thủ đúng cấu trúc của Goong Maps API.
- Xem chi tiết payload `POST /maps/directions` tại `frontend-integration.md`.
