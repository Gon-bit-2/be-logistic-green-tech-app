export const NotificationType = {
  ROLE_REQUEST_SUBMITTED: 'ROLE_REQUEST_SUBMITTED',
  ROLE_REQUEST_APPROVED: 'ROLE_REQUEST_APPROVED',
  ROLE_REQUEST_REJECTED: 'ROLE_REQUEST_REJECTED',
  DRIVER_ASSIGNMENT_REQUEST_SUBMITTED: 'DRIVER_ASSIGNMENT_REQUEST_SUBMITTED',
  DRIVER_ASSIGNMENT_REQUEST_APPROVED: 'DRIVER_ASSIGNMENT_REQUEST_APPROVED',
  DRIVER_ASSIGNMENT_REQUEST_REJECTED: 'DRIVER_ASSIGNMENT_REQUEST_REJECTED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
} as const

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType]

/**
 * Danh sách trạng thái đơn hàng cần phát notification cho Customer.
 * Được extract ra constant chung để tránh duplicate ở OrdersService và TrackingService.
 */
export const NOTIFIABLE_ORDER_STATUSES = new Set(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const)

/** Kiểm tra một status có nằm trong danh sách cần notify hay không */
export function isNotifiableOrderStatus(status: string): boolean {
  return NOTIFIABLE_ORDER_STATUSES.has(status as any)
}
