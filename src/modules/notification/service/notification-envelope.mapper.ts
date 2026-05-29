import { Injectable } from '@nestjs/common'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import roleName from 'src/common/constants/role.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import { NotificationPayloadType } from '../model/notification.model'
import type {
  CodCollectedEvent,
  CodSettlementEvent,
  DriverAssignmentRequestReviewedEvent,
  DriverAssignmentRequestSubmittedEvent,
  NotificationDomainEvent,
  OrderNotifiableStatus,
  SlaAlertNotificationEvent,
} from '../events/notification.event'
import { NotificationEventName } from '../events/notification.event'

export type NotificationEnvelope = {
  dedupeKey: string
  message: string
  payload: NotificationPayloadType | Record<string, unknown>
  recipientUserIds: number[]
  title: string
  type: (typeof NotificationType)[keyof typeof NotificationType]
}

@Injectable()
export class NotificationEnvelopeMapper {
  buildEnvelope(eventName: string, payload: NotificationDomainEvent): NotificationEnvelope {
    switch (eventName) {
      case NotificationEventName.ROLE_REQUEST_SUBMITTED: {
        const event = payload as {
          recipientUserIds: number[]
          requesterName: string
          targetRoleName: typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF
          roleRequestId: number
        }
        return {
          dedupeKey: `${eventName}:${event.roleRequestId}`,
          message: `${event.requesterName} đã gửi yêu cầu đăng ký vai trò ${event.targetRoleName}.`,
          payload: {
            roleRequestId: event.roleRequestId,
            status: RoleRequestStatus.PENDING,
            targetRoleName: event.targetRoleName,
          },
          recipientUserIds: event.recipientUserIds,
          title: 'Yêu cầu quyền mới',
          type: NotificationType.ROLE_REQUEST_SUBMITTED,
        }
      }
      case NotificationEventName.ROLE_REQUEST_REVIEWED: {
        const event = payload as {
          userId: number
          targetRoleName: typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF
          roleRequestId: number
          status: typeof RoleRequestStatus.APPROVED | typeof RoleRequestStatus.REJECTED
          reviewedById: number
        }
        const isApproved = event.status === RoleRequestStatus.APPROVED
        return {
          dedupeKey: `${eventName}:${event.roleRequestId}:${event.status}`,
          message: isApproved
            ? `Yêu cầu đăng ký vai trò ${event.targetRoleName} của bạn đã được duyệt.`
            : `Yêu cầu đăng ký vai trò ${event.targetRoleName} của bạn đã bị từ chối.`,
          payload: {
            reviewedById: event.reviewedById,
            roleRequestId: event.roleRequestId,
            status: event.status,
            targetRoleName: event.targetRoleName,
          },
          recipientUserIds: [event.userId],
          title: isApproved ? 'Yêu cầu quyền đã được duyệt' : 'Yêu cầu quyền bị từ chối',
          type: isApproved ? NotificationType.ROLE_REQUEST_APPROVED : NotificationType.ROLE_REQUEST_REJECTED,
        }
      }
      case NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED: {
        const event = payload as DriverAssignmentRequestSubmittedEvent
        return {
          dedupeKey: `${eventName}:${event.assignmentRequestId}`,
          message: `${event.driverFullName} vừa gửi yêu cầu nhận đơn ${event.orderTrackingCode}.`,
          payload: {
            assignmentRequestId: event.assignmentRequestId,
            driverId: event.driverId,
            hubId: event.hubId,
            orderId: event.orderId,
            orderTrackingCode: event.orderTrackingCode,
            status: DriverAssignmentRequestStatus.PENDING,
          },
          recipientUserIds: event.recipientUserIds,
          title: 'Tài xế xin nhận đơn mới',
          type: NotificationType.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
        }
      }
      case NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED: {
        const event = payload as DriverAssignmentRequestReviewedEvent
        const isApproved = event.status === DriverAssignmentRequestStatus.APPROVED
        return {
          dedupeKey: `${eventName}:${event.assignmentRequestId}:${event.status}`,
          message: isApproved
            ? `Yêu cầu nhận đơn ${event.orderTrackingCode} của bạn đã được staff chấp nhận.`
            : `Yêu cầu nhận đơn ${event.orderTrackingCode} của bạn đã bị từ chối.`,
          payload: {
            assignmentRequestId: event.assignmentRequestId,
            driverId: event.driverId,
            hubId: event.hubId,
            orderId: event.orderId,
            orderTrackingCode: event.orderTrackingCode,
            reviewNote: event.reviewNote ?? undefined,
            reviewedById: event.reviewedById,
            status: event.status,
          },
          recipientUserIds: [event.userId],
          title: isApproved ? 'Yêu cầu nhận đơn đã được duyệt' : 'Yêu cầu nhận đơn bị từ chối',
          type: isApproved
            ? NotificationType.DRIVER_ASSIGNMENT_REQUEST_APPROVED
            : NotificationType.DRIVER_ASSIGNMENT_REQUEST_REJECTED,
        }
      }
      case NotificationEventName.ORDER_CREATED: {
        const event = payload as { userId: number; orderId: number; trackingCode: string }
        return {
          dedupeKey: `${eventName}:${event.orderId}`,
          message: `Đơn hàng ${event.trackingCode} đã được tạo thành công.`,
          payload: {
            orderId: event.orderId,
            orderStatus: ORDER_STATUS.PENDING,
            trackingCode: event.trackingCode,
          },
          recipientUserIds: [event.userId],
          title: 'Tạo đơn hàng thành công',
          type: NotificationType.ORDER_CREATED,
        }
      }
      case NotificationEventName.ORDER_STATUS_UPDATED: {
        const event = payload as { userId: number; orderId: number; trackingCode: string; status: OrderNotifiableStatus }
        const config = this.getOrderStatusNotificationConfig(event.status)
        return {
          dedupeKey: `${eventName}:${event.orderId}:${event.status}`,
          message: config.message(event.trackingCode),
          payload: {
            orderId: event.orderId,
            orderStatus: event.status,
            trackingCode: event.trackingCode,
          },
          recipientUserIds: [event.userId],
          title: config.title,
          type: config.type,
        }
      }
      case NotificationEventName.SLA_ALERT_CREATED:
      case NotificationEventName.SLA_ALERT_RESOLVED:
        return this.buildSlaEnvelope(eventName, payload as SlaAlertNotificationEvent)
      case NotificationEventName.COD_COLLECTED:
        return this.buildCodCollectedEnvelope(eventName, payload as CodCollectedEvent)
      case NotificationEventName.COD_SETTLEMENT_SUBMITTED:
      case NotificationEventName.COD_SETTLEMENT_COMPLETED:
      case NotificationEventName.COD_SETTLEMENT_DISPUTED:
        return this.buildCodSettlementEnvelope(eventName, payload as CodSettlementEvent)
      default:
        throw new Error(`Unsupported notification event: ${eventName}`)
    }
  }

  private buildSlaEnvelope(eventName: string, event: SlaAlertNotificationEvent): NotificationEnvelope {
    const isResolved = eventName === NotificationEventName.SLA_ALERT_RESOLVED
    return {
      dedupeKey: `${eventName}:${event.alertId}`,
      message: isResolved
        ? `Cảnh báo SLA của đơn ${event.trackingCode} đã được xử lý.`
        : `Đơn ${event.trackingCode} có nguy cơ trễ SLA theo ETA hiện tại.`,
      payload: {
        alertId: event.alertId,
        deadlineAt: event.deadlineAt ?? null,
        etaAt: event.etaAt ?? null,
        orderId: event.orderId,
        trackingCode: event.trackingCode,
        tripId: event.tripId ?? null,
      },
      recipientUserIds: event.recipientUserIds,
      title: isResolved ? 'Cảnh báo SLA đã xử lý' : 'Cảnh báo trễ SLA',
      type: isResolved ? NotificationType.SLA_ALERT_RESOLVED : NotificationType.SLA_ALERT_CREATED,
    }
  }

  private buildCodCollectedEnvelope(eventName: string, event: CodCollectedEvent): NotificationEnvelope {
    return {
      dedupeKey: `${eventName}:${event.orderId}`,
      message: `Đã ghi nhận thu COD ${event.amount.toLocaleString('vi-VN')}đ cho đơn ${event.trackingCode}.`,
      payload: {
        amount: event.amount,
        driverId: event.driverId,
        orderId: event.orderId,
        trackingCode: event.trackingCode,
      },
      recipientUserIds: event.recipientUserIds,
      title: 'Đã thu COD',
      type: NotificationType.COD_COLLECTED,
    }
  }

  private buildCodSettlementEnvelope(eventName: string, event: CodSettlementEvent): NotificationEnvelope {
    const config =
      eventName === NotificationEventName.COD_SETTLEMENT_COMPLETED
        ? {
            title: 'Batch COD đã hoàn tất',
            type: NotificationType.COD_SETTLEMENT_COMPLETED,
          }
        : eventName === NotificationEventName.COD_SETTLEMENT_DISPUTED
          ? {
              title: 'Batch COD bị tranh chấp',
              type: NotificationType.COD_SETTLEMENT_DISPUTED,
            }
          : {
              title: 'Batch COD mới',
              type: NotificationType.COD_SETTLEMENT_SUBMITTED,
            }

    return {
      dedupeKey: `${eventName}:${event.batchId}:${event.status}`,
      message: `${config.title}: ${event.batchCode} (${event.totalAmount.toLocaleString('vi-VN')}đ).`,
      payload: {
        batchCode: event.batchCode,
        batchId: event.batchId,
        driverId: event.driverId,
        status: event.status,
        totalAmount: event.totalAmount,
      },
      recipientUserIds: event.recipientUserIds,
      title: config.title,
      type: config.type,
    }
  }

  private getOrderStatusNotificationConfig(status: OrderNotifiableStatus): {
    type: (typeof NotificationType)[keyof typeof NotificationType]
    title: string
    message: (trackingCode: string) => string
  } {
    switch (status) {
      case ORDER_STATUS.OUT_FOR_DELIVERY:
        return {
          type: NotificationType.ORDER_OUT_FOR_DELIVERY,
          title: 'Đơn hàng đang được giao',
          message: (trackingCode) => `Đơn hàng ${trackingCode} đang được giao đến bạn.`,
        }
      case ORDER_STATUS.DELIVERED:
        return {
          type: NotificationType.ORDER_DELIVERED,
          title: 'Đơn hàng đã giao thành công',
          message: (trackingCode) => `Đơn hàng ${trackingCode} đã được giao thành công.`,
        }
      case ORDER_STATUS.CANCELLED:
        return {
          type: NotificationType.ORDER_CANCELLED,
          title: 'Đơn hàng đã bị hủy',
          message: (trackingCode) => `Đơn hàng ${trackingCode} đã bị hủy.`,
        }
    }
  }
}
