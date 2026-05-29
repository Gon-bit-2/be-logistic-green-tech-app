import { Injectable } from '@nestjs/common'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import roleName from 'src/common/constants/role.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import { NotificationRepository } from '../repository/notification.repo'
import {
  GetNotificationsQueryType,
  UpdateNotificationPreferencesType,
} from '../model/notification.model'
import type {
  DriverAssignmentRequestReviewedEvent,
  DriverAssignmentRequestSubmittedEvent,
  NotificationDomainEvent,
  OrderNotifiableStatus,
} from '../events/notification.event'
import { NotificationQueryService } from './notification-query.service'
import { NotificationPreferenceService } from './notification-preference.service'
import {
  NotificationDispatchResult,
  NotificationDispatchService,
} from './notification-dispatch.service'

export type { NotificationDispatchResult }

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly queryService: NotificationQueryService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly dispatchService: NotificationDispatchService,
  ) {}

  findAll(userId: number, query: GetNotificationsQueryType) {
    return this.queryService.findAll(userId, query)
  }

  getUnreadCount(userId: number) {
    return this.queryService.getUnreadCount(userId)
  }

  markAsRead(userId: number, id: number) {
    return this.queryService.markAsRead(userId, id)
  }

  markAllAsRead(userId: number) {
    return this.queryService.markAllAsRead(userId)
  }

  getPreferences(userId: number) {
    return this.preferenceService.getPreferences(userId)
  }

  updatePreferences(userId: number, payload: UpdateNotificationPreferencesType) {
    return this.preferenceService.updatePreferences(userId, payload)
  }

  dispatchDomainEvent(eventName: string, payload: NotificationDomainEvent, attemptCount = 0) {
    return this.dispatchService.dispatchDomainEvent(eventName, payload, attemptCount)
  }

  async createRoleRequestSubmittedNotifications(input: {
    recipientUserIds: number[]
    requesterName: string
    targetRoleName: typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF
    roleRequestId: number
  }) {
    await this.notificationRepository.createManyForUsers(input.recipientUserIds, {
      type: NotificationType.ROLE_REQUEST_SUBMITTED,
      title: 'Yêu cầu quyền mới',
      message: `${input.requesterName} đã gửi yêu cầu đăng ký vai trò ${input.targetRoleName}.`,
      payload: {
        roleRequestId: input.roleRequestId,
        targetRoleName: input.targetRoleName,
        status: RoleRequestStatus.PENDING,
      },
    })
  }

  async createRoleRequestReviewedNotification(input: {
    userId: number
    targetRoleName: typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF
    roleRequestId: number
    status: typeof RoleRequestStatus.APPROVED | typeof RoleRequestStatus.REJECTED
    reviewedById: number
  }) {
    const isApproved = input.status === RoleRequestStatus.APPROVED

    await this.notificationRepository.createManyForUsers([input.userId], {
      type: isApproved ? NotificationType.ROLE_REQUEST_APPROVED : NotificationType.ROLE_REQUEST_REJECTED,
      title: isApproved ? 'Yêu cầu quyền đã được duyệt' : 'Yêu cầu quyền bị từ chối',
      message: isApproved
        ? `Yêu cầu đăng ký vai trò ${input.targetRoleName} của bạn đã được duyệt.`
        : `Yêu cầu đăng ký vai trò ${input.targetRoleName} của bạn đã bị từ chối.`,
      payload: {
        roleRequestId: input.roleRequestId,
        targetRoleName: input.targetRoleName,
        status: input.status,
        reviewedById: input.reviewedById,
      },
    })
  }

  async createOrderCreatedNotification(input: { userId: number; orderId: number; trackingCode: string }) {
    await this.notificationRepository.createManyForUsers([input.userId], {
      type: NotificationType.ORDER_CREATED,
      title: 'Tạo đơn hàng thành công',
      message: `Đơn hàng ${input.trackingCode} đã được tạo thành công.`,
      payload: {
        orderId: input.orderId,
        trackingCode: input.trackingCode,
        orderStatus: ORDER_STATUS.PENDING,
      },
    })
  }

  async createOrderStatusNotification(input: {
    userId: number
    orderId: number
    trackingCode: string
    status: OrderNotifiableStatus
  }) {
    const config = this.getOrderStatusNotificationConfig(input.status)

    await this.notificationRepository.createManyForUsers([input.userId], {
      type: config.type,
      title: config.title,
      message: config.message(input.trackingCode),
      payload: {
        orderId: input.orderId,
        trackingCode: input.trackingCode,
        orderStatus: input.status,
      },
    })
  }

  async createDriverAssignmentRequestSubmittedNotifications(input: DriverAssignmentRequestSubmittedEvent) {
    await this.notificationRepository.createManyForUsers(input.recipientUserIds, {
      type: NotificationType.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
      title: 'Tài xế xin nhận đơn mới',
      message: `${input.driverFullName} vừa gửi yêu cầu nhận đơn ${input.orderTrackingCode}.`,
      payload: {
        assignmentRequestId: input.assignmentRequestId,
        driverId: input.driverId,
        hubId: input.hubId,
        orderId: input.orderId,
        orderTrackingCode: input.orderTrackingCode,
        status: DriverAssignmentRequestStatus.PENDING,
      },
    })
  }

  async createDriverAssignmentRequestReviewedNotification(input: DriverAssignmentRequestReviewedEvent) {
    const isApproved = input.status === DriverAssignmentRequestStatus.APPROVED

    await this.notificationRepository.createManyForUsers([input.userId], {
      type: isApproved
        ? NotificationType.DRIVER_ASSIGNMENT_REQUEST_APPROVED
        : NotificationType.DRIVER_ASSIGNMENT_REQUEST_REJECTED,
      title: isApproved ? 'Yêu cầu nhận đơn đã được duyệt' : 'Yêu cầu nhận đơn bị từ chối',
      message: isApproved
        ? `Yêu cầu nhận đơn ${input.orderTrackingCode} của bạn đã được staff chấp nhận.`
        : `Yêu cầu nhận đơn ${input.orderTrackingCode} của bạn đã bị từ chối.`,
      payload: {
        assignmentRequestId: input.assignmentRequestId,
        driverId: input.driverId,
        hubId: input.hubId,
        orderId: input.orderId,
        orderTrackingCode: input.orderTrackingCode,
        reviewNote: input.reviewNote ?? undefined,
        reviewedById: input.reviewedById,
        status: input.status,
      },
    })
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
