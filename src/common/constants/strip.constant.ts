export const TRIP_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export const STOP_TYPE = {
  PICKUP: 'PICKUP', // Điểm lấy hàng từ khách
  DROPOFF: 'DROPOFF', // Điểm giao hàng cho khách
  HUB_TRANSFER: 'HUB_TRANSFER', // Điểm dừng tại kho trung chuyển
} as const

export type TripStatusType = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS]
export type StopType = (typeof STOP_TYPE)[keyof typeof STOP_TYPE]
