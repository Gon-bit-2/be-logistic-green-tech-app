export const ORDER_STATUS = {
  PENDING: 'PENDING', // Vừa tạo, chờ xử lý
  ASSIGNED: 'ASSIGNED', // Đã gán vào chuyến xe
  PICKED_UP: 'PICKED_UP', // Tài xế đã lấy hàng
  IN_TRANSIT: 'IN_TRANSIT', // Đang di chuyển trên xe
  ARRIVED_AT_HUB: 'ARRIVED_AT_HUB', // Đang lưu kho tại trạm trung chuyển
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', // Đang giao đến khách (Last-mile)
  DELIVERED: 'DELIVERED', // Giao thành công
  CANCELLED: 'CANCELLED', // Đã hủy
} as const

export const SERVICE_TYPE = {
  EXPRESS: 'EXPRESS', // Giao hỏa tốc
  STANDARD: 'STANDARD', // Tiêu chuẩn
  ECO_GREEN: 'ECO_GREEN', // Giao hàng gom chuyến, tối ưu CO2
} as const

export const STOP_TYPE = {
  PICKUP: 'PICKUP', // Điểm lấy hàng từ khách
  DROPOFF: 'DROPOFF', // Điểm giao hàng cho khách
  HUB_TRANSFER: 'HUB_TRANSFER', // Điểm dừng tại kho trung chuyển
} as const

export type OrderStatusType = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]
export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE]
export type StopType = (typeof STOP_TYPE)[keyof typeof STOP_TYPE]
