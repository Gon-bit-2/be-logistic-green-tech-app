# Logistic Green Tech Backend

Backend NestJS + Prisma cho bài toán logistics xanh: auth, fleet, hub, tracking, payment, role request, notification và green-tech emission.

## Tài liệu chính

- API reference: [docs/api-reference.md](docs/api-reference.md)
- Frontend integration guide: [docs/frontend-integration.md](docs/frontend-integration.md)

## Trạng thái API hiện tại

Module đang được mount trong `src/app.module.ts`:

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

## Chạy local

### Cài dependency

```bash
npm install
```

### Đồng bộ database schema trước khi chạy app

```bash
npx prisma migrate deploy
```

Nếu môi trường mới chưa có permission rows cho route mới:

```bash
npm run p
```

### Chạy development

```bash
npm run start:dev
```

Server mặc định:

```txt
http://localhost:3000
```

## Scripts chính

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

## Stack chính

- NestJS 11
- Prisma + PostgreSQL
- Zod / nestjs-zod
- BullMQ + Redis
- Stripe
- Google OAuth2

## Ghi chú kỹ thuật

- Không có global prefix `/api`
- `main.ts` đang bật `helmet()` và `enableCors()`
- Runtime đang dùng auth mặc định kiểu `Bearer`, kèm permission check theo `role + path + method`
- Có thêm `ResourceAccessGuard` cho một số resource owner/hub-level access
- Có flow `role-requests` + `notifications` cho đăng ký vai trò `DRIVER` / `WAREHOUSE_STAFF`
- Flow notification của `role-requests` hiện được phát qua Nest `EventEmitter`
- Notification hiện đã có thêm các mốc order: `ORDER_CREATED`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`
- Nếu chưa apply migration `20260420_add_role_requests_notifications`, các endpoint `/notifications` và `/role-requests` sẽ lỗi do thiếu bảng `notifications` / `role_requests`
- Nếu chưa apply migration `20260420_add_order_notifications`, các enum notification mới cho order sẽ chưa tồn tại trong DB
- Permission route có thể đồng bộ lại bằng `npm run p`
