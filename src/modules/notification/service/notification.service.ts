import { Injectable, NotFoundException } from '@nestjs/common'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import roleName from 'src/common/constants/role.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import { NotificationRepository } from '../repository/notification.repo'
import {
  GetNotificationsQueryType,
  NotificationPayloadType,
  UpdateNotificationPreferencesType,
} from '../model/notification.model'
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

type NotificationEnvelope = {
  dedupeKey: string
  message: string
  payload: NotificationPayloadType | Record<string, unknown>
  recipientUserIds: number[]
  title: string
  type: (typeof NotificationType)[keyof typeof NotificationType]
}

export type NotificationDispatchResult = {
  deliveryId: number | null
  notification: Awaited<ReturnType<NotificationRepository['createForUserIdempotent']>> | null
  status: 'PENDING' | 'SKIPPED'
  userId: number
}

/**
 * Service managing user notifications, channel preferences, and domain event dispatches.
 * Handles database persistence, preference checks, and creates localized in-app notification records.
 *
 * Dịch vụ quản lý thông báo của người dùng, thiết lập kênh ưu tiên và phân phối sự kiện nghiệp vụ (domain event).
 * Xử lý lưu trữ cơ sở dữ liệu, kiểm tra kênh ưu tiên và tạo các bản ghi thông báo in-app được bản địa hóa.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  /**
   * Retrieves a paginated list of notifications for a specific user.
   *
   * Lấy danh sách các thông báo có phân trang cho một người dùng cụ thể.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @param query The filter and pagination options.
   *              Các tùy chọn bộ lọc và phân trang.
   * @returns A promise resolving to the user's notifications.
   *          Một promise trả về danh sách thông báo của người dùng.
   */
  async findAll(userId: number, query: GetNotificationsQueryType) {
    return await this.notificationRepository.findManyByUser(userId, query)
  }

  /**
   * Retrieves the total count of unread notifications for a specific user.
   *
   * Lấy tổng số lượng thông báo chưa đọc của một người dùng cụ thể.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @returns A promise resolving to the unread count.
   *          Một promise trả về số lượng chưa đọc.
   */
  async getUnreadCount(userId: number) {
    const totalUnread = await this.notificationRepository.countUnreadByUser(userId)
    return { totalUnread }
  }

  /**
   * Marks a specific notification as read.
   *
   * Đánh dấu một thông báo cụ thể là đã đọc.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @param id The unique identifier of the notification.
   *           Mã định danh duy nhất của thông báo.
   * @returns A promise resolving to the operation status.
   *          Một promise trả về trạng thái hoạt động.
   * @throws {NotFoundException} If the notification is not found.
   *                             Nếu không tìm thấy thông báo.
   */
  async markAsRead(userId: number, id: number) {
    const notification = await this.notificationRepository.findByIdForUser(userId, id)
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo')
    }

    await this.notificationRepository.markAsRead(userId, id)
    return {
      message: 'Đánh dấu thông báo đã đọc thành công',
    }
  }

  /**
   * Marks all notifications as read for a specific user.
   *
   * Đánh dấu tất cả thông báo là đã đọc cho một người dùng cụ thể.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @returns A promise resolving to the operation status.
   *          Một promise trả về trạng thái hoạt động.
   */
  async markAllAsRead(userId: number) {
    await this.notificationRepository.markAllAsRead(userId)
    return {
      message: 'Đánh dấu tất cả thông báo đã đọc thành công',
    }
  }

  /**
   * Retrieves the notification channel preferences for a user.
   *
   * Lấy các thiết lập kênh thông báo ưu tiên của một người dùng.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @returns A promise resolving to the list of preferences.
   *          Một promise trả về danh sách ưu tiên.
   */
  async getPreferences(userId: number) {
    const data = await this.notificationRepository.listPreferences(userId)
    return { data }
  }

  /**
   * Updates or inserts notification preferences for a user.
   *
   * Cập nhật hoặc chèn mới thiết lập kênh thông báo ưu tiên cho một người dùng.
   *
   * @param userId The unique identifier of the user.
   *               ID duy nhất của người dùng.
   * @param payload The updated preferences payload.
   *                Payload chứa các thiết lập ưu tiên được cập nhật.
   * @returns A promise resolving to the saved preferences.
   *          Một promise trả về các ưu tiên đã lưu.
   */
  async updatePreferences(userId: number, payload: UpdateNotificationPreferencesType) {
    const data = await this.notificationRepository.upsertPreferences(userId, payload.preferences)
    return { data }
  }

  /**
   * Main entrypoint to dispatch a domain event as a set of notifications.
   * Maps event name to a generic envelope, performs channel preference checks, and triggers pushes.
   *
   * Điểm khởi đầu chính để phân phối sự kiện nghiệp vụ dưới dạng một nhóm thông báo.
   * Ánh xạ tên sự kiện sang một envelope chung, thực hiện kiểm tra ưu tiên kênh, và kích hoạt đẩy.
   *
   * @param eventName Name of the domain event.
   *                  Tên của sự kiện nghiệp vụ.
   * @param payload The event payload containing context.
   *                Payload sự kiện chứa ngữ cảnh.
   * @param attemptCount The current retry attempt count.
   *                     Số lần thử lại hiện tại.
   * @returns A promise resolving to dispatch results for each recipient.
   *          Một promise trả về kết quả phân phối cho từng người nhận.
   */
  async dispatchDomainEvent(eventName: string, payload: NotificationDomainEvent, attemptCount = 0) {
    const envelope = this.buildEnvelope(eventName, payload)
    return this.createRealtimeNotifications(envelope, attemptCount)
  }

  /**
   * Creates notifications when a new user role request is submitted.
   * Target audience is usually Administrators.
   *
   * Tạo các thông báo khi có yêu cầu cấp quyền vai trò người dùng mới được gửi.
   * Đối tượng nhận thông thường là các Quản trị viên (Admin).
   *
   * @param input Detailed parameters including recipients, requester, and role.
   *              Các tham số chi tiết bao gồm người nhận, người yêu cầu và vai trò.
   */
  async createRoleRequestSubmittedNotifications(input: {
    recipientUserIds: number[]
    requesterName: string
    targetRoleName: typeof roleName.DRIVER | typeof roleName.WAREHOUSE_STAFF
    roleRequestId: number
  }) {
    const payload: NotificationPayloadType = {
      roleRequestId: input.roleRequestId,
      targetRoleName: input.targetRoleName,
      status: RoleRequestStatus.PENDING,
    }

    await this.notificationRepository.createManyForUsers(input.recipientUserIds, {
      type: NotificationType.ROLE_REQUEST_SUBMITTED,
      title: 'Yêu cầu quyền mới',
      message: `${input.requesterName} đã gửi yêu cầu đăng ký vai trò ${input.targetRoleName}.`,
      payload,
    })
  }

  /**
   * Creates a notification for a user when their role request has been approved or rejected.
   *
   * Tạo một thông báo cho người dùng khi yêu cầu cấp quyền vai trò của họ được duyệt hoặc từ chối.
   *
   * @param input Approval details including recipient, role, status, and reviewer.
   *              Chi tiết phê duyệt bao gồm người nhận, vai trò, trạng thái và người phê duyệt.
   */
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

  /**
   * Creates a notification for a customer when their order is successfully created.
   *
   * Tạo một thông báo cho khách hàng khi đơn hàng của họ được tạo thành công.
   *
   * @param input Order created metadata.
   *              Siêu dữ liệu đơn hàng được tạo.
   */
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

  /**
   * Creates a notification when an order undergoes a state transition.
   * Maps statuses like OUT_FOR_DELIVERY, DELIVERED, and CANCELLED to specific messages.
   *
   * Tạo một thông báo khi đơn hàng trải qua một chuyển đổi trạng thái.
   * Ánh xạ các trạng thái như OUT_FOR_DELIVERY, DELIVERED, và CANCELLED sang các tin nhắn cụ thể.
   *
   * @param input Order state change parameters.
   *              Các tham số thay đổi trạng thái đơn hàng.
   */
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

  /**
   * Creates notifications for hub staff when a driver submits a request to assign themselves to a trip.
   *
   * Tạo các thông báo cho nhân viên hub khi một tài xế gửi yêu cầu tự nhận gán vào một chuyến đi.
   *
   * @param input Event data including requester and recipients.
   *              Dữ liệu sự kiện bao gồm người yêu cầu và người nhận.
   */
  async createDriverAssignmentRequestSubmittedNotifications(input: DriverAssignmentRequestSubmittedEvent) {
    const payload: NotificationPayloadType = {
      assignmentRequestId: input.assignmentRequestId,
      driverId: input.driverId,
      hubId: input.hubId,
      orderId: input.orderId,
      orderTrackingCode: input.orderTrackingCode,
      status: DriverAssignmentRequestStatus.PENDING,
    }

    await this.notificationRepository.createManyForUsers(input.recipientUserIds, {
      type: NotificationType.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
      title: 'Tài xế xin nhận đơn mới',
      message: `${input.driverFullName} vừa gửi yêu cầu nhận đơn ${input.orderTrackingCode}.`,
      payload,
    })
  }

  /**
   * Creates a notification for a driver when their assignment request has been approved or rejected.
   *
   * Tạo một thông báo cho tài xế khi yêu cầu tự nhận đơn của họ được chấp thuận hoặc từ chối.
   *
   * @param input Review status parameters.
   *              Các tham số trạng thái phê duyệt.
   */
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

  /**
   * Core helper mapping general envelopes to idempotent database creation and Socket broadcast rooms.
   * Enforces user channel preferences (filters out if in-app is disabled).
   *
   * Hàm hỗ trợ cốt lõi để ánh xạ các envelope chung sang việc tạo DB bất biến và phòng phát sóng Socket.
   * Áp dụng cài đặt ưu tiên kênh của người dùng (bỏ qua nếu in-app bị tắt).
   *
   * @param envelope General notification data envelope.
   *                 Envelope dữ liệu thông báo chung.
   * @param attemptCount Attempt index for retries.
   *                     Chỉ số lần thử để gửi lại.
   * @returns A promise resolving to dispatch summaries.
   *          Một promise trả về tóm tắt phân phối.
   */
  private async createRealtimeNotifications(
    envelope: NotificationEnvelope,
    attemptCount: number,
  ): Promise<NotificationDispatchResult[]> {
    const uniqueRecipientIds = Array.from(new Set(envelope.recipientUserIds)).filter((userId) => userId > 0)
    const results: NotificationDispatchResult[] = []

    for (const userId of uniqueRecipientIds) {
      const preference = await this.notificationRepository.findPreference(userId, envelope.type)
      if (preference && !preference.inAppEnabled) {
        const skipped = await this.notificationRepository.createDelivery({
          attemptCount,
          notificationId: null,
          status: 'SKIPPED',
          userId,
        })
        results.push({ deliveryId: skipped.id, notification: null, status: 'SKIPPED', userId })
        continue
      }

      const notification = await this.notificationRepository.createForUserIdempotent(userId, {
        dedupeKey: envelope.dedupeKey,
        message: envelope.message,
        payload: envelope.payload,
        title: envelope.title,
        type: envelope.type,
      })
      const delivery = await this.notificationRepository.createDelivery({
        attemptCount,
        notificationId: notification.id,
        status: 'PENDING',
        userId,
      })

      results.push({ deliveryId: delivery.id, notification, status: 'PENDING', userId })
    }

    return results
  }

  /**
   * Helper function mapping abstract domain events to standard in-app notifications envelopes.
   *
   * Hàm hỗ trợ ánh xạ các sự kiện nghiệp vụ trừu tượng sang envelope thông báo in-app tiêu chuẩn.
   *
   * @param eventName Name of the event.
   *                  Tên sự kiện.
   * @param payload The domain event object.
   *                Đối tượng sự kiện nghiệp vụ.
   * @returns The constructed notification envelope.
   *          Envelope thông báo đã tạo.
   * @throws {Error} If the event type is unsupported.
   *                 Nếu loại sự kiện không được hỗ trợ.
   */
  private buildEnvelope(eventName: string, payload: NotificationDomainEvent): NotificationEnvelope {
    switch (eventName) {
      case NotificationEventName.ROLE_REQUEST_SUBMITTED: {
        const event = payload as Parameters<NotificationService['createRoleRequestSubmittedNotifications']>[0]
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
        const event = payload as Parameters<NotificationService['createRoleRequestReviewedNotification']>[0]
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
        const event = payload as Parameters<NotificationService['createOrderCreatedNotification']>[0]
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
        const event = payload as Parameters<NotificationService['createOrderStatusNotification']>[0]
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

  /**
   * Helper function to construct a SLA alert notification envelope.
   *
   * Hàm hỗ trợ tạo envelope thông báo cảnh báo SLA.
   *
   * @param eventName The event name.
   *                  Tên sự kiện.
   * @param event The SLA alert notification event details.
   *              Chi tiết sự kiện thông báo cảnh báo SLA.
   * @returns The constructed notification envelope.
   *          Envelope thông báo đã tạo.
   */
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

  /**
   * Helper function to construct a COD collected notification envelope.
   *
   * Hàm hỗ trợ tạo envelope thông báo thu hộ COD.
   *
   * @param eventName The event name.
   *                  Tên sự kiện.
   * @param event The COD collected event details.
   *              Chi tiết sự kiện thu hộ COD.
   * @returns The constructed notification envelope.
   *          Envelope thông báo đã tạo.
   */
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

  /**
   * Helper function to construct a COD batch settlement notification envelope.
   *
   * Hàm hỗ trợ tạo envelope thông báo tất toán lô COD.
   *
   * @param eventName The event name.
   *                  Tên sự kiện.
   * @param event The COD settlement event details.
   *              Chi tiết sự kiện tất toán COD.
   * @returns The constructed notification envelope.
   *          Envelope thông báo đã tạo.
   */
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

  /**
   * Helper function to obtain status-specific notification configuration.
   * Maps statuses like OUT_FOR_DELIVERY, DELIVERED, and CANCELLED to localized texts.
   *
   * Hàm hỗ trợ lấy cấu hình thông báo cụ thể cho từng trạng thái đơn hàng.
   * Ánh xạ các trạng thái như OUT_FOR_DELIVERY, DELIVERED, và CANCELLED sang văn bản được bản địa hóa.
   *
   * @param status The target order status.
   *               Trạng thái đơn hàng đích.
   * @returns Config object with notification type, title, and message mapper.
   *          Đối tượng cấu hình chứa loại thông báo, tiêu đề và hàm tạo tin nhắn.
   */
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
