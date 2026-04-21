import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'

export const NotificationEventName = {
  ROLE_REQUEST_SUBMITTED: 'notification.role-request.submitted',
  ROLE_REQUEST_REVIEWED: 'notification.role-request.reviewed',
  ORDER_CREATED: 'notification.order.created',
  ORDER_STATUS_UPDATED: 'notification.order.status-updated',
} as const

export type RoleRequestTargetRoleName =
  | typeof roleName.DRIVER
  | typeof roleName.WAREHOUSE_STAFF

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
