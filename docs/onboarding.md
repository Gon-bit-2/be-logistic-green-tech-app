# Backend onboarding

## Chạy local

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

Nếu permission route bị thiếu, chạy:

```bash
npm run p
```

## Test và build

```bash
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
```

## Cấu trúc cần nắm

- `src/common`: guard, middleware, filter, constants, shared service.
- `src/database`: Prisma bootstrap và pool.
- `src/modules/orders`: order lifecycle và quote.
- `src/modules/trips`: dispatch, assignment, trip execution.
- `src/modules/tracking`: timeline, POD, WebSocket tracking.
- `src/modules/notification`: event listener và inbox.
- `prisma/schema.prisma`: schema, relation, index.

## Quy tắc code

- Controller giữ mỏng; nghiệp vụ ở service; query phức tạp đặt ở repository/helper.
- List endpoint trả summary; detail endpoint trả nested object.
- Khi thêm lỗi nghiệp vụ có thể dùng message dạng `Error.Domain.Reason` để frontend map ổn định.
- Không log token, password, OTP, Stripe secret, Cloudinary secret.
- Chỉ comment logic nghiệp vụ khó hoặc ràng buộc vận hành; tránh comment dòng hiển nhiên.

## Checklist khi sửa module trips/tracking

1. Xác định actor role: admin, warehouse staff, driver, customer.
2. Kiểm tra hub scope hoặc owner scope trước khi update dữ liệu.
3. Với thay đổi order/trip status, kiểm tra state machine và payment/COD.
4. Dùng transaction khi update nhiều bảng cùng một nghiệp vụ.
5. Cập nhật unit test cho nhánh quyền, trạng thái hợp lệ và trạng thái lỗi.
