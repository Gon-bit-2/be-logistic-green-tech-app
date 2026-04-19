# Logistic Green Tech Backend

Backend NestJS + Prisma cho bài toán logistics xanh: auth, fleet, hub, tracking, payment và green-tech emission.

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

Module có source nhưng chưa mount:

- `orders`
- `trips`

## Chạy local

### Cài dependency

```bash
npm install
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
- Auth guard có source nhưng chưa được wire đầy đủ ở runtime
- Stripe webhook đang cần raw body nhưng bootstrap app chưa bật `rawBody`
