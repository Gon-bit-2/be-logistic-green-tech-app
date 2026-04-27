# Logistic Green Tech Backend

Backend chính của hệ thống logistics xanh, xây bằng NestJS và Prisma. Service này chịu trách nhiệm cho toàn bộ luồng nghiệp vụ vận hành: xác thực, đơn hàng, chuyến xe, tracking, thanh toán, thông báo, green-tech emission, role request, upload và wallet.

## Mục tiêu

- Cung cấp REST API cho frontend Next.js.
- Quản lý vòng đời đơn hàng từ tạo đơn đến giao thành công hoặc chuyển hub.
- Điều phối chuyến xe, tài xế và phương tiện.
- Theo dõi tracking nội bộ/public, POD và vị trí realtime qua WebSocket.
- Xử lý Stripe, COD và các nghiệp vụ liên quan đến wallet.

## Stack chính

- NestJS 11
- Prisma + PostgreSQL
- Zod / `nestjs-zod`
- BullMQ + Redis
- Socket.IO
- Stripe
- Cloudinary
- Google OAuth2
- Resend

## Cấu trúc chính

```text
backend/
├── docs/                Tài liệu tích hợp và ghi chú kỹ thuật
├── prisma/              Schema, migration, seed
├── src/
│   ├── common/          Guard, decorator, constant, helper dùng chung
│   ├── config/          Validate biến môi trường
│   ├── database/        Prisma bootstrap
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
├── test/                API / e2e config
└── inittalScript/       Script seed permission
```

## Module đang expose

Các module API hiện có trong app:

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
- `upload`
- `wallet`
- `notifications`
- `role-requests`

## Yêu cầu môi trường

Cần có các dịch vụ sau trước khi chạy local:

- PostgreSQL
- Redis
- Tài khoản Stripe
- Tài khoản Cloudinary
- Tài khoản Google OAuth
- Tài khoản Resend

## Biến môi trường bắt buộc

File `.env` của backend được validate ngay khi app boot. Nếu thiếu key, server sẽ dừng.

Các nhóm biến chính:

- Database: `DATABASE_URL`
- JWT/Auth: `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `API_KEY_SECRET`
- Admin seed: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE_NUMBER`
- OTP/Mail: `OTP_EXPIRES_IN`, `RESEND_API_KEY`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_REDIRECT_URI`
- Redis/BullMQ: `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`
- Payment: `PAYMENT_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Upload: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Maps: `GOONG_MAPS_API_KEY`, `GOONG_BASE_URL`

Không đưa giá trị thật của `.env` lên Git.

## Chạy local

### 1. Cài dependency

```bash
npm install
```

### 2. Chuẩn bị database

Áp migration:

```bash
npx prisma migrate deploy
```

Nếu cần sinh Prisma client thủ công:

```bash
npx prisma generate
```

Nếu cần seed hoặc đồng bộ permission:

```bash
npm run p
```

### 3. Chạy development

```bash
npm run start:dev
```

Port thực tế phụ thuộc vào cấu hình `.env`. Trong môi trường hiện tại backend đang được frontend trỏ tới `http://localhost:8386`.

## Scripts hay dùng

```bash
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:api
npm run test:e2e
npm run test:full
```

## Testing

- `npm run test:unit`: chạy unit test theo cấu hình Jest `--runInBand`
- `npm run test:api`: chạy test API theo `test/jest-api.json`
- `npm run test:e2e`: chạy e2e test theo `test/jest-e2e.json`
- `npm run test:full`: chạy toàn bộ chuỗi test backend

## Tài liệu liên quan

- [docs/api-reference.md](docs/api-reference.md)
- [docs/frontend-integration.md](docs/frontend-integration.md)
- [docs/backend-goong-integration-requirements.md](docs/backend-goong-integration-requirements.md)
- [docs/test-report.md](docs/test-report.md)

## Ghi chú triển khai

- Không dùng global prefix `/api`.
- `main.ts` bật `helmet()` và `enableCors()`.
- Auth dùng Bearer token và permission check theo `role + path + method`.
- Có `ResourceAccessGuard` cho các luồng owner-level hoặc hub-level access.
- Tracking realtime chạy qua namespace Socket.IO riêng.
- Luồng role request và notification được phát qua `EventEmitter`.
- Luồng payment hiện hỗ trợ cả Stripe lẫn COD.
- Rule vận hành hiện tại: đơn `STRIPE` phải thanh toán thành công trước khi được đưa vào vận chuyển; đơn `COD` giữ luồng dispatch bình thường.

## Troubleshooting

- App báo thiếu env: kiểm tra lại `.env` vì `src/config/config.ts` validate cứng khi khởi động.
- Frontend không gọi được API: kiểm tra `NEXT_PUBLIC_API_BASE_URL` ở frontend có trỏ đúng backend.
- Lỗi quyền truy cập route: chạy lại script permission bằng `npm run p`.
- Lỗi bảng notification / role request / enum mới: kiểm tra migration đã được apply đầy đủ.
