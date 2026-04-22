# Backend Requirements For Goong Integration

Tài liệu này mô tả mong muốn từ phía frontend để hoàn thiện flow map + địa chỉ + tạo đơn với Goong.

Ngày cập nhật: `2026-04-22`

## 1. Mục tiêu

Frontend không chỉ cần render map.

Mục tiêu đầy đủ là:

- Hiển thị map dispatcher bằng Goong thay cho Google Maps
- Tìm kiếm địa chỉ Việt Nam bằng autocomplete
- Resolve địa chỉ thành tọa độ thật trước khi tạo đơn
- Có route/quote preview thực tế thay cho mock hiện tại
- Dùng chung dữ liệu địa chỉ thật cho order, address book, và tracking

## 2. Hiện trạng frontend

Các điểm quan trọng trong code hiện tại:

- Màn dispatcher đang dùng Google Maps tại `src/features/admin/presentation/components/DispatcherMapCanvas.tsx`
- Form tạo đơn đang dùng text input thuần cho địa chỉ tại `src/features/orders/presentation/components/OrderForm.tsx`
- Frontend đang map payload tạo đơn ở `src/features/orders/application/mappers/create-order-request.mapper.ts`
- Hiện tại mapper này đang tạo `senderLat/senderLng` và `receiverLat/receiverLng` bằng logic giả lập từ chuỗi địa chỉ, chưa dùng geocoding thật
- Frontend gọi `POST /orders` bằng shape API mới tại `src/features/orders/infrastructure/api/order.api.ts`

Kết luận:

- Contract `/orders` hiện tại cơ bản đã phù hợp cho flow thật
- Phần còn thiếu chủ yếu là backend proxy/service cho Goong REST APIs

## 3. Điều backend không cần đổi

Không cần đổi contract hiện có của `POST /orders` chỉ để tích hợp Goong.

Frontend vẫn muốn giữ request tạo đơn theo shape hiện tại:

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

Điểm quan trọng:

- Backend tiếp tục nhận `senderLat`, `senderLng`, `receiverLat`, `receiverLng` là `number`
- Backend không cần tự geocode nếu frontend đã gửi đủ tọa độ thật
- Backend vẫn có thể tự validate sâu hơn nếu muốn

## 4. Điều backend cần thêm

### 4.1. Giữ Goong REST API key ở backend

Frontend có thể dùng `NEXT_PUBLIC_GOONG_MAPS_TILES_KEY` để render map.

Nhưng frontend không nên gọi trực tiếp Goong REST bằng `NEXT_PUBLIC_GOONG_MAPS_API_KEY`.

Backend nên giữ và gọi Goong REST API cho:

- Places Autocomplete
- Place Detail
- Geocoding
- Directions

Lý do:

- Tránh lộ REST key ra client
- Chủ động rate-limit, logging, cache, fallback
- Chuẩn hóa response cho frontend

## 4.2. Thêm nhóm endpoint `maps`

Đề xuất tối thiểu:

### `GET /maps/places/autocomplete`

Mục đích:

- Gợi ý địa chỉ khi người dùng nhập pickup/delivery address

Query đề xuất:

- `input`: text user đang gõ
- `sessionToken`: string
- `lat`: optional
- `lng`: optional
- `limit`: optional

Response đề xuất:

```json
{
  "data": [
    {
      "placeId": "goong-place-id",
      "description": "91 Trung Kính, Trung Hòa, Cầu Giấy, Hà Nội",
      "mainText": "91 Trung Kính",
      "secondaryText": "Trung Hòa, Cầu Giấy, Hà Nội"
    }
  ]
}
```

Ghi chú:

- Backend có thể map từ Goong `Place/AutoComplete`
- Frontend không cần raw response đầy đủ của Goong

### `GET /maps/places/detail`

Mục đích:

- Resolve 1 suggestion thành địa chỉ chuẩn + tọa độ

Query đề xuất:

- `placeId`: required
- `sessionToken`: optional

Response đề xuất:

```json
{
  "placeId": "goong-place-id",
  "name": "91 Trung Kính",
  "formattedAddress": "91 Trung Kính, Trung Hòa, Cầu Giấy, Hà Nội",
  "latitude": 21.0137625240001,
  "longitude": 105.798267363
}
```

### `GET /maps/geocode`

Mục đích:

- Resolve free-text address thành tọa độ khi không đi qua autocomplete

Query đề xuất:

- `address`: required

Response đề xuất:

```json
{
  "data": [
    {
      "formattedAddress": "91 Trung Kính, Trung Hòa, Cầu Giấy, Hà Nội",
      "latitude": 21.0137625240001,
      "longitude": 105.798267363,
      "placeId": "goong-place-id"
    }
  ]
}
```

### `POST /maps/directions`

Mục đích:

- Preview route thực tế giữa điểm gửi và điểm nhận

Request đề xuất:

```json
{
  "origin": {
    "lat": 10.776889,
    "lng": 106.700806
  },
  "destination": {
    "lat": 10.773118,
    "lng": 106.698299
  },
  "vehicle": "car"
}
```

Response đề xuất:

```json
{
  "distanceMeters": 1800,
  "durationSeconds": 420,
  "polyline": "encoded-polyline",
  "bounds": null
}
```

## 4.3. Thêm endpoint quote thực tế

Frontend hiện vẫn hiển thị quote mock trong form tạo đơn.

Backend nên thêm:

### `POST /orders/quote`

Mục đích:

- Báo giá trước khi tạo đơn
- Tính phí dựa trên khoảng cách thật, service type, khối lượng, thể tích, hub rules nếu có

Request đề xuất:

```json
{
  "senderAddress": "123 Nguyen Trai, Quan 1, TP HCM",
  "senderLat": 10.776889,
  "senderLng": 106.700806,
  "receiverAddress": "456 Le Loi, Quan 1, TP HCM",
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

Response đề xuất:

```json
{
  "distanceMeters": 1800,
  "durationSeconds": 420,
  "shippingFee": 42500,
  "currency": "VND",
  "serviceType": "STANDARD",
  "estimatedCo2Saved": 0.0625,
  "polyline": "encoded-polyline"
}
```

Ghi chú:

- `polyline` giúp frontend render route preview ngay
- Có thể reuse cùng logic pricing nội bộ đang dùng lúc tạo order

## 5. Điều frontend kỳ vọng ở response order

Backend hiện đã trả các field tọa độ trong order response.

Frontend mong backend tiếp tục giữ:

- `senderAddress`
- `senderLat`
- `senderLng`
- `receiverAddress`
- `receiverLat`
- `receiverLng`
- `currentHubId`
- `currentTripId`

Lý do:

- Dispatcher map cần marker đơn hàng
- Tracking nội bộ cần định vị đơn/chuyến
- Route preview và admin tools cần dữ liệu tọa độ đầy đủ

## 6. Gợi ý mở rộng model dữ liệu

Không bắt buộc trong phase đầu, nhưng nên cân nhắc:

- `senderPlaceId`
- `receiverPlaceId`
- `senderFormattedAddress`
- `receiverFormattedAddress`

Các field này hữu ích cho:

- Debug dữ liệu địa chỉ
- Re-geocode hoặc backfill sau này
- Đồng bộ tốt hơn với address book

## 7. Address Book nên tương thích flow mới

Backend hiện đã có `address-book` với:

- `address`
- `latitude`
- `longitude`

Khuyến nghị:

- Giữ nguyên contract cũ để không phá flow hiện tại
- Có thể mở rộng thêm `placeId` và `formattedAddress`

Điều này giúp frontend:

- Chọn nhanh pickup/delivery từ sổ địa chỉ
- Không phải geocode lại các địa chỉ đã lưu

## 8. Tracking không cần đổi lớn

Realtime tracking hiện tại đã ổn.

Không cần đổi WebSocket chỉ vì chuyển từ Google sang Goong.

Các event hiện có vẫn phù hợp:

- `driverLocationUpdate`
- `locationUpdated`

Nếu cần nâng cấp sau này, backend có thể thêm:

- route snapping
- route deviation detection
- ETA recalculation

Nhưng đó không phải blocker cho phase hiện tại.

## 9. Thứ tự triển khai đề xuất

Ưu tiên 1:

- Thêm `GET /maps/places/autocomplete`
- Thêm `GET /maps/places/detail`
- Thêm `GET /maps/geocode`

Ưu tiên 2:

- Thêm `POST /maps/directions`
- Thêm `POST /orders/quote`

Ưu tiên 3:

- Mở rộng order/address-book với `placeId` hoặc `formattedAddress`

## 10. Acceptance criteria

Được xem là hoàn tất phase này khi:

- User nhập địa chỉ pickup/delivery và thấy gợi ý thật từ Goong
- User chọn 1 gợi ý và frontend nhận được tọa độ thật
- Frontend không còn dùng logic hash/fake coordinates để tạo đơn
- Frontend gọi `POST /orders` với tọa độ thật
- Frontend hiển thị được route preview hoặc quote thật trước khi submit
- Dispatcher map có thể render được hub và order marker bằng dữ liệu thật

## 11. Tóm tắt ngắn cho backend

Nếu cần chốt ngắn gọn:

- Giữ nguyên contract `POST /orders`
- Không để frontend gọi Goong REST trực tiếp
- Backend thêm proxy `maps/*`
- Backend thêm `POST /orders/quote`
- Backend tiếp tục trả đầy đủ lat/lng trong order response

