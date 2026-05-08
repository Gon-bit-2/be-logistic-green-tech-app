import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'

export const NotificationEventName = {
  ROLE_REQUEST_SUBMITTED: 'notification.role-request.submitted',
  ROLE_REQUEST_REVIEWED: 'notification.role-request.reviewed',
  DRIVER_ASSIGNMENT_REQUEST_SUBMITTED: 'notification.driver-assignment-request.submitted',
  DRIVER_ASSIGNMENT_REQUEST_REVIEWED: 'notification.driver-assignment-request.reviewed',
  ORDER_CREATED: 'notification.order.created',
  ORDER_STATUS_UPDATED: 'notification.order.status-updated',
  SLA_ALERT_CREATED: 'notification.sla-alert.created',
  SLA_ALERT_RESOLVED: 'notification.sla-alert.resolved',
  COD_COLLECTED: 'notification.cod.collected',
  COD_SETTLEMENT_SUBMITTED: 'notification.cod-settlement.submitted',
  COD_SETTLEMENT_COMPLETED: 'notification.cod-settlement.completed',
  COD_SETTLEMENT_DISPUTED: 'notification.cod-settlement.disputed',
} as const

export type RoleRequestTargetRoleName = typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF

export type RoleRequestSubmittedEvent = {
  recipientUserIds: number[]
  requesterName: string
  targetRoleName: RoleRequestTargetRoleName
  roleRequestId: number
}

export type RoleRequestReviewedEvent = {
  userId: number
  targetRoleName: RoleRequestTargetRoleName
  roleRequestId: number
  status: typeof RoleRequestStatus.APPROVED | typeof RoleRequestStatus.REJECTED
  reviewedById: number
}

export type OrderCreatedEvent = {
  userId: number
  orderId: number
  trackingCode: string
}

export type DriverAssignmentRequestSubmittedEvent = {
  assignmentRequestId: number
  driverFullName: string
  recipientUserIds: number[]
  hubId: number
  driverId: number
  orderId: number
  orderTrackingCode: string
}

export type DriverAssignmentRequestReviewedEvent = {
  assignmentRequestId: number
  userId: number
  hubId: number
  driverId: number
  orderId: number
  orderTrackingCode: string
  reviewedById: number
  reviewNote?: string | null
  status: typeof DriverAssignmentRequestStatus.APPROVED | typeof DriverAssignmentRequestStatus.REJECTED
}

export type OrderNotifiableStatus =
  | typeof ORDER_STATUS.OUT_FOR_DELIVERY
  | typeof ORDER_STATUS.DELIVERED
  | typeof ORDER_STATUS.CANCELLED

export type OrderStatusUpdatedEvent = {
  userId: number
  orderId: number
  trackingCode: string
  status: OrderNotifiableStatus
}

export type SlaAlertNotificationEvent = {
  alertId: number
  deadlineAt?: Date | string | null
  etaAt?: Date | string | null
  orderId: number
  recipientUserIds: number[]
  trackingCode: string
  tripId?: number | null
}

export type CodCollectedEvent = {
  amount: number
  driverId: number
  orderId: number
  recipientUserIds: number[]
  trackingCode: string
}

export type CodSettlementEvent = {
  batchCode: string
  batchId: number
  driverId: number
  recipientUserIds: number[]
  status: 'SUBMITTED' | 'COMPLETED' | 'DISPUTED'
  totalAmount: number
}

export type NotificationDomainEvent =
  | RoleRequestSubmittedEvent
  | RoleRequestReviewedEvent
  | DriverAssignmentRequestSubmittedEvent
  | DriverAssignmentRequestReviewedEvent
  | OrderCreatedEvent
  | OrderStatusUpdatedEvent
  | SlaAlertNotificationEvent
  | CodCollectedEvent
  | CodSettlementEvent
