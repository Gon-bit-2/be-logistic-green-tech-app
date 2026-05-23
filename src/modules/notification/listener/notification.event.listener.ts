import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { DELIVER_NOTIFICATION_JOB_NAME, NOTIFICATION_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { NotificationEventName } from '../events/notification.event'
import type {
  DriverAssignmentRequestReviewedEvent,
  DriverAssignmentRequestSubmittedEvent,
  OrderCreatedEvent,
  OrderStatusUpdatedEvent,
  RoleRequestReviewedEvent,
  RoleRequestSubmittedEvent,
} from '../events/notification.event'

export type NotificationQueueJobData = {
  eventName: string
  payload: unknown
}

/**
 * Event listener that listens to internal application domain events and enqueues them into BullMQ.
 * 
 * Trình lắng nghe sự kiện để lắng nghe các sự kiện domain nội bộ của ứng dụng và đưa chúng vào hàng đợi BullMQ.
 */
@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name)

  /**
   * Initializes the NotificationEventListener.
   * 
   * Khởi tạo NotificationEventListener.
   * 
   * @param notificationQueue - The BullMQ queue for delivering notifications / Hàng đợi BullMQ để gửi thông báo.
   */
  constructor(@InjectQueue(NOTIFICATION_QUEUE_NAME) private readonly notificationQueue: Queue<NotificationQueueJobData>) {}

  /**
   * Handles role request submitted events.
   * 
   * Xử lý sự kiện gửi yêu cầu thay đổi vai trò.
   * 
   * @param event - Role request submitted event details / Chi tiết sự kiện gửi yêu cầu thay đổi vai trò.
   */
  @OnEvent(NotificationEventName.ROLE_REQUEST_SUBMITTED, { async: true })
  async handleRoleRequestSubmitted(event: RoleRequestSubmittedEvent) {
    await this.enqueue(NotificationEventName.ROLE_REQUEST_SUBMITTED, event, `role-request-submitted-${event.roleRequestId}`)
  }

  /**
   * Handles role request reviewed events.
   * 
   * Xử lý sự kiện duyệt/từ chối yêu cầu thay đổi vai trò.
   * 
   * @param event - Role request reviewed event details / Chi tiết sự kiện duyệt/từ chối yêu cầu thay đổi vai trò.
   */
  @OnEvent(NotificationEventName.ROLE_REQUEST_REVIEWED, { async: true })
  async handleRoleRequestReviewed(event: RoleRequestReviewedEvent) {
    await this.enqueue(
      NotificationEventName.ROLE_REQUEST_REVIEWED,
      event,
      `role-request-reviewed-${event.roleRequestId}-${event.status}`,
    )
  }

  /**
   * Handles driver assignment request submitted events.
   * 
   * Xử lý sự kiện gửi yêu cầu gán tài xế.
   * 
   * @param event - Driver assignment request event details / Chi tiết sự kiện gửi yêu cầu gán tài xế.
   */
  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED, { async: true })
  async handleDriverAssignmentRequestSubmitted(event: DriverAssignmentRequestSubmittedEvent) {
    await this.enqueue(
      NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
      event,
      `driver-assignment-submitted-${event.assignmentRequestId}`,
    )
  }

  /**
   * Handles driver assignment request reviewed events.
   * 
   * Xử lý sự kiện duyệt/từ chối yêu cầu gán tài xế.
   * 
   * @param event - Driver assignment review event details / Chi tiết sự kiện duyệt/từ chối yêu cầu gán tài xế.
   */
  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, { async: true })
  async handleDriverAssignmentRequestReviewed(event: DriverAssignmentRequestReviewedEvent) {
    await this.enqueue(
      NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED,
      event,
      `driver-assignment-reviewed-${event.assignmentRequestId}-${event.status}`,
    )
  }

  /**
   * Handles order created events.
   * 
   * Xử lý sự kiện đơn hàng được tạo mới.
   * 
   * @param event - Order created event details / Chi tiết sự kiện đơn hàng mới.
   */
  @OnEvent(NotificationEventName.ORDER_CREATED, { async: true })
  async handleOrderCreated(event: OrderCreatedEvent) {
    await this.enqueue(NotificationEventName.ORDER_CREATED, event, `order-created-${event.orderId}`)
  }

  /**
   * Handles order status updated events.
   * 
   * Xử lý sự kiện trạng thái đơn hàng được cập nhật.
   * 
   * @param event - Order status updated event details / Chi tiết sự kiện cập nhật trạng thái đơn hàng.
   */
  @OnEvent(NotificationEventName.ORDER_STATUS_UPDATED, { async: true })
  async handleOrderStatusUpdated(event: OrderStatusUpdatedEvent) {
    await this.enqueue(
      NotificationEventName.ORDER_STATUS_UPDATED,
      event,
      `order-status-${event.orderId}-${event.status}`,
    )
  }

  /**
   * Handles SLA alert created events.
   * 
   * Xử lý sự kiện cảnh báo SLA được tạo.
   * 
   * @param event - SLA alert created event details / Chi tiết sự kiện cảnh báo SLA.
   */
  @OnEvent(NotificationEventName.SLA_ALERT_CREATED, { async: true })
  async handleSlaAlertCreated(event: unknown) {
    await this.enqueue(NotificationEventName.SLA_ALERT_CREATED, event, this.resolveGenericJobId('sla-created', event))
  }

  /**
   * Handles SLA alert resolved events.
   * 
   * Xử lý sự kiện cảnh báo SLA đã được giải quyết.
   * 
   * @param event - SLA alert resolved event details / Chi tiết sự kiện SLA đã giải quyết.
   */
  @OnEvent(NotificationEventName.SLA_ALERT_RESOLVED, { async: true })
  async handleSlaAlertResolved(event: unknown) {
    await this.enqueue(NotificationEventName.SLA_ALERT_RESOLVED, event, this.resolveGenericJobId('sla-resolved', event))
  }

  /**
   * Handles COD collected events.
   * 
   * Xử lý sự kiện thu tiền hộ COD.
   * 
   * @param event - COD collected event details / Chi tiết sự kiện thu tiền COD.
   */
  @OnEvent(NotificationEventName.COD_COLLECTED, { async: true })
  async handleCodCollected(event: unknown) {
    await this.enqueue(NotificationEventName.COD_COLLECTED, event, this.resolveGenericJobId('cod-collected', event))
  }

  /**
   * Handles COD settlement submitted events.
   * 
   * Xử lý sự kiện gửi yêu cầu quyết toán COD.
   * 
   * @param event - COD settlement submitted event details / Chi tiết sự kiện gửi quyết toán COD.
   */
  @OnEvent(NotificationEventName.COD_SETTLEMENT_SUBMITTED, { async: true })
  async handleCodSettlementSubmitted(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_SUBMITTED,
      event,
      this.resolveGenericJobId('cod-settlement-submitted', event),
    )
  }

  /**
   * Handles COD settlement completed events.
   * 
   * Xử lý sự kiện quyết toán COD thành công.
   * 
   * @param event - COD settlement completed event details / Chi tiết sự kiện quyết toán COD thành công.
   */
  @OnEvent(NotificationEventName.COD_SETTLEMENT_COMPLETED, { async: true })
  async handleCodSettlementCompleted(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_COMPLETED,
      event,
      this.resolveGenericJobId('cod-settlement-completed', event),
    )
  }

  /**
   * Handles COD settlement disputed events.
   * 
   * Xử lý sự kiện phát sinh tranh chấp quyết toán COD.
   * 
   * @param event - COD settlement dispute event details / Chi tiết sự kiện tranh chấp quyết toán COD.
   */
  @OnEvent(NotificationEventName.COD_SETTLEMENT_DISPUTED, { async: true })
  async handleCodSettlementDisputed(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_DISPUTED,
      event,
      this.resolveGenericJobId('cod-settlement-disputed', event),
    )
  }

  /**
   * Enqueues a notification job into the BullMQ queue with retry policies and deduplication.
   * 
   * Đẩy một công việc gửi thông báo vào hàng đợi BullMQ với chính sách thử lại và chống trùng lặp.
   * 
   * @param eventName - Name of the notification domain event / Tên của sự kiện domain thông báo.
   * @param payload - Raw event payload data / Dữ liệu payload thô của sự kiện.
   * @param jobId - Custom deduplication job ID / ID job tùy chỉnh để chống trùng lặp.
   */
  private async enqueue(eventName: string, payload: unknown, jobId: string) {
    try {
      await this.notificationQueue.add(
        DELIVER_NOTIFICATION_JOB_NAME,
        { eventName, payload },
        {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          jobId,
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 86400, count: 1000 },
        },
      )
    } catch (error) {
      this.logger.error(
        `Failed to enqueue notification event=${eventName} jobId=${jobId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  /**
   * Resolves a unique job ID from generic event data.
   * 
   * Tìm và giải quyết một ID công việc duy nhất từ dữ liệu sự kiện chung.
   * 
   * @param prefix - String prefix for the job ID / Tiền tố chuỗi cho ID công việc.
   * @param event - Raw event object / Đối tượng sự kiện thô.
   * @returns Generated job ID string / Chuỗi ID công việc được tạo.
   */
  private resolveGenericJobId(prefix: string, event: unknown) {
    const record = event && typeof event === 'object' ? (event as Record<string, unknown>) : {}
    const id = record.alertId ?? record.orderId ?? record.batchId ?? record.id ?? Date.now()
    const status = record.status ? `-${String(record.status)}` : ''
    return `${prefix}-${String(id)}${status}`
  }
}
