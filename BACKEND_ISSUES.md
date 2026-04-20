# Backend / Integration Issues

## Open

### 2026-04-20 - Notifications backend is unavailable in live environment

- Symptom:
  - mở `/dashboard/customer/notifications` hoặc `/dashboard/admin/notifications`
  - frontend render state lỗi `Không thể tải notifications`
- Backend detail observed from the live response:

```text
Invalid `prisma.notification.count()` invocation: The table `public.notifications` does not exist in the current database.
```

- Impact:
  - không thể kiểm tra `notification integrity`
  - không thể xác nhận `mark one` / `mark all`
  - live suite trước đó bị timeout mơ hồ vì page đã vào error state nhưng helper chưa nhận diện fail-fast
- Frontend status:
  - FE đã được vá để không hiển thị raw Prisma/internal error trực tiếp cho người dùng cuối
  - live helper đã được cập nhật để ghi nhận lỗi này rõ ràng và cho phép flow tiếp tục cover các khu vực khác
- Next action needed from backend owner:
  - chạy migration/seed để bảo đảm bảng `public.notifications` tồn tại ở môi trường đang test
  - xác nhận lại các endpoint notifications hoạt động với schema hiện tại

### 2026-04-20 - Role requests backend is unavailable in live environment

- Symptom:
  - mở `/dashboard/customer/roles`
  - frontend render state lỗi `Không thể tải role requests`
- Backend detail observed from the live response:

```text
Invalid `prisma.roleRequest.findMany()` invocation: The table `public.role_requests` does not exist in the current database.
```

- Impact:
  - chặn toàn bộ flow `customer -> driver`
  - chặn toàn bộ flow `customer -> warehouse_staff`
  - admin không thể review/approve role requests ở live environment này
- Frontend status:
  - FE đã được vá để không hiển thị raw Prisma/internal error trực tiếp cho người dùng cuối
  - live helper đã được cập nhật để fail-fast với thông báo rõ ràng thay vì timeout ở `selectOption`
- Next action needed from backend owner:
  - chạy migration/seed để bảo đảm bảng `public.role_requests` tồn tại ở môi trường đang test
  - xác nhận lại các endpoint list/create/approve/reject role request hoạt động với schema hiện tại

## Resolved / No Longer Blocking

### 2026-04-20 - `POST /orders` contract mismatch with frontend payload

- Trạng thái hiện tại:
  - backend docs đã được cập nhật
  - frontend đã map payload tạo đơn sang contract mới
  - live flow tạo đơn + checkout COD đã chạy qua được
- Ghi chú:
  - đây không còn là blocker hiện tại của frontend repo
