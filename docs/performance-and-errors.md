# Backend performance và xử lý lỗi

Tài liệu này ghi các quy ước vận hành cho NestJS backend.

## Cấu hình hiệu năng

- `DB_POOL_MAX`: số connection tối đa của PostgreSQL pool. Mặc định `10`.
- `DB_POOL_IDLE_TIMEOUT_MS`: thời gian đóng connection rảnh. Mặc định `30000`.
- `PRISMA_QUERY_LOG=1`: chỉ bật khi cần debug query tại local. Mặc định dev/prod chỉ log `warn` và `error`.
- `SLOW_REQUEST_MS`: ngưỡng đánh dấu HTTP request chậm. Mặc định `1000`.
- `TRACKING_ACCESS_CACHE_TTL_MS`: TTL cache quyền join room tracking. Mặc định `15000`.

## Request id và log

`RequestIdMiddleware` đọc `x-request-id` từ client hoặc tự tạo UUID. Response luôn trả lại header này để frontend hoặc log collector đối chiếu.

`LoggingMiddleware` log mỗi request theo dạng:

```text
[requestId] METHOD /path status durationMs | size=bytes uid=userId slow=yes|no ua="..."
```

Request lỗi `4xx`, `5xx` hoặc vượt `SLOW_REQUEST_MS` được log ở mức `warn/error`.

## Error envelope

HTTP error trả về dạng ổn định:

```json
{
  "statusCode": 403,
  "message": "Error.PermissionDenied.NotYourHub",
  "errorCode": "Error.PermissionDenied.NotYourHub",
  "errors": {},
  "requestId": "uuid",
  "path": "/orders",
  "timestamp": "2026-05-03T00:00:00.000Z"
}
```

`errorCode` là optional và chỉ xuất hiện với lỗi dạng machine code `Error.*` hoặc khi service truyền rõ `errorCode`.

## Query hotspot

- List endpoint chỉ trả dữ liệu summary. Detail endpoint mới trả nested object nặng.
- Orders list dùng select nhẹ, không kéo `items` và `payment`.
- Trips list dùng summary gồm driver, vehicle, `orderCount`; stops/order detail chỉ lấy ở trip detail.
- Tracking WebSocket cache quyền join room ngắn hạn để tránh query lặp khi dashboard sync nhiều trip.

## Checklist debug request chậm

1. Lấy `requestId` từ response hoặc log frontend.
2. Tìm log backend theo `[requestId]`.
3. Nếu `slow=yes`, kiểm tra route có đang gọi list/detail đúng mục đích không.
4. Bật tạm `PRISMA_QUERY_LOG=1` ở local để xem query; không bật ở production lâu dài.
5. Với orders/trips/notifications, kiểm tra migration index mới đã apply.
