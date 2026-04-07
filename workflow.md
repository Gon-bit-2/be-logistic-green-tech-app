# SMART LOGISTICS SYSTEM - PROJECT WORKFLOW

_Version 1.0 - Giai đoạn khởi tạo & Phát triển Core API_

## 🎯 Mục tiêu dự án

Xây dựng hệ thống quản lý logistics hướng tới chuyển đổi số và công nghệ xanh. Kiến trúc Client-Server (Next.js + NestJS + PostgreSQL + Prisma). Dự án được thiết kế chuẩn Enterprise, tối ưu hóa các luồng dữ liệu phức tạp để thể hiện tư duy thiết kế hệ thống backend.

---

## ✅ PHASE 1: Nền tảng bảo mật (Đã hoàn thành)

**Module: Auth & Users**

- [x] Thiết lập kiến trúc thư mục NestJS (Module-based).
- [x] Cấu hình Prisma và kết nối PostgreSQL.
- [x] Xây dựng `AuthModule`: Đăng ký, Đăng nhập.
- [x] Tích hợp JWT Token.
- [x] Phân quyền bằng `RolesGuard` cho các nhóm: `ADMIN`, `CUSTOMER`, `DRIVER`, `WAREHOUSE_STAFF`.

---

## 🚀 PHASE 2: Dữ liệu nền tảng (Giai đoạn hiện hành)

_Đây là bước bắt buộc trước khi xử lý logic nghiệp vụ. Hệ thống cần có dữ liệu về Kho bãi và Xe cộ để làm tham số cho các thuật toán tính toán lộ trình và khí thải._

### 1. Module Hubs (Quản lý Kho trung chuyển)

_Mục đích: Xác định các điểm trạm để điều phối và lưu trữ hàng hóa._

- [ ] **Database:** Đảm bảo bảng `Hub` đã được migrate.
- [ ] **API - Tạo mới Kho (`POST /hubs`):**
  - **Payload:** `name`, `code`, `address`, `latitude`, `longitude`.
  - **Logic:** Validate tọa độ hợp lệ, kiểm tra trùng lặp mã kho (`code`). Chỉ `ADMIN` mới được phép gọi API này.
- [ ] **API - Lấy danh sách Kho (`GET /hubs`):**
  - **Logic:** Hỗ trợ pagination (phân trang) và search theo tên kho.
- [ ] **API - Phân bổ nhân sự (`POST /hubs/:id/staff`):**
  - **Logic:** Gán một user (có role `WAREHOUSE_STAFF`) vào làm việc tại `hubId` tương ứng để quản lý quyền truy cập dữ liệu kho.

### 2. Module Fleet (Quản lý Phương tiện)

_Mục đích: Quản lý năng lực vận tải và cung cấp thông số Chỉ số xả thải (Green Tech)._

- [ ] **Database:** Đảm bảo bảng `Vehicle` đã được migrate.
- [ ] **API - Thêm Xe mới (`POST /vehicles`):**
  - **Payload:** `licensePlate`, `type`, `fuelType`, `capacityWeight`, `capacityVolume`, `emissionRatePerKm`.
  - **Logic:** Sử dụng `class-validator` để đảm bảo các thông số kỹ thuật (tải trọng, thể tích) phải là số dương.
- [ ] **API - Lấy danh sách Xe (`GET /vehicles`):**
  - **Logic:** Thêm tính năng filter theo `isActive` và `type` (VD: Lấy danh sách toàn bộ xe tải điện `ELECTRIC_VAN` đang rảnh).
- [ ] **Script Seeding Dữ liệu giả lập (Mock Data):**
  - **Task:** Viết script tại `prisma/seed.ts` để tự động chèn vào database khoảng 5 Kho trung chuyển (Hà Nội, Đà Nẵng, HCM...) và 20 Phương tiện các loại. Điều này rất quan trọng để có dữ liệu test thuật toán ở Phase 3.

---

## ⏳ PHASE 3: Logic Nghiệp vụ Cốt lõi (Chuẩn bị triển khai)

_Giai đoạn phức tạp nhất, quyết định sự thành bại của hệ thống._

**1. Module Orders (Quản lý Đơn hàng)**

- [ ] Cấu trúc API `POST /orders` cho Customer tạo đơn.
- [ ] Logic tính phí vận chuyển cơ bản dựa trên khoảng cách (sử dụng công thức Haversine để tính khoảng cách chim bay trước khi dùng Google Maps API).
- [ ] Logic tính toán `estimatedCo2Saved` dự kiến để hiển thị cho Customer.

**2. Module Trips (Điều phối & Gom chuyến - Thuật toán)**

- [ ] Xây dựng logic **Bin Packing**: Lọc các đơn `PENDING`, nhét vào xe sao cho tổng khối lượng và thể tích hàng không vượt quá `capacityWeight` và `capacityVolume` của xe.
- [ ] Xây dựng thuật toán sắp xếp thứ tự điểm dừng (`TripStop`) để tối ưu lộ trình.

---

## 🔮 PHASE 4: Tính năng Nâng cao (Điểm nhấn Kỹ thuật)

- [ ] **Module Tracking (Event Sourcing):** Lưu vết lịch sử di chuyển (`OrderTrackingEvent`) và xử lý upload Bằng chứng giao hàng (Proof of Delivery - POD).
- [ ] **Module Green Tech:** Job tính toán lượng $CO_2$ thực tế xả ra sau khi chuyến xe hoàn tất và lưu vào `TripEmissionLog`.
- [ ] **Module Payment:** Tích hợp Stripe API cho luồng thanh toán phí vận chuyển.

---

## 💻 PHASE 5: Tích hợp Frontend (Next.js)

_Gắn kết API với 7 màn hình giao diện (UI Specs) đã thiết kế:_

- [ ] 1. Màn hình Thống kê Admin Dashboard (Biểu đồ Green Tech).
- [ ] 2. Form Tạo đơn hàng cho Customer.
- [ ] 3. Trang tra cứu Tracking & POD.
- [ ] 4. Màn hình Điều phối (Dispatcher) kèm Bản đồ.
- [ ] 5. Giao diện Ứng dụng Tài xế (Driver App - Cập nhật trạng thái).
- [ ] 6. Giao diện Máy quét kho bãi (Hub Scanner).
- [ ] 7. Cổng thanh toán Checkout.
