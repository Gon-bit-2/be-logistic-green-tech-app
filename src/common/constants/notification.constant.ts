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
  SLA_ALERT_CREATED: 'SLA_ALERT_CREATED',
  SLA_ALERT_RESOLVED: 'SLA_ALERT_RESOLVED',
  COD_COLLECTED: 'COD_COLLECTED',
  COD_SETTLEMENT_SUBMITTED: 'COD_SETTLEMENT_SUBMITTED',
  COD_SETTLEMENT_COMPLETED: 'COD_SETTLEMENT_COMPLETED',
  COD_SETTLEMENT_DISPUTED: 'COD_SETTLEMENT_DISPUTED',
} as const

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType]

export const NotificationDeliveryStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const

export const NotificationDeliveryChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  PUSH: 'PUSH',
  SMS: 'SMS',
} as const

/**
 * Danh sách trạng thái đơn hàng cần phát notification cho Customer.
 * Được extract ra constant chung để tránh duplicate ở OrdersService và TrackingService.
 */
export const NOTIFIABLE_ORDER_STATUSES = new Set(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const)

/** Kiểm tra một status có nằm trong danh sách cần notify hay không */
export function isNotifiableOrderStatus(status: string): boolean {
  return NOTIFIABLE_ORDER_STATUSES.has(status as typeof NOTIFIABLE_ORDER_STATUSES extends Set<infer T> ? T : never)
}
