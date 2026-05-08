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

@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name)

  constructor(@InjectQueue(NOTIFICATION_QUEUE_NAME) private readonly notificationQueue: Queue<NotificationQueueJobData>) {}

  @OnEvent(NotificationEventName.ROLE_REQUEST_SUBMITTED, { async: true })
  async handleRoleRequestSubmitted(event: RoleRequestSubmittedEvent) {
    await this.enqueue(NotificationEventName.ROLE_REQUEST_SUBMITTED, event, `role-request-submitted-${event.roleRequestId}`)
  }

  @OnEvent(NotificationEventName.ROLE_REQUEST_REVIEWED, { async: true })
  async handleRoleRequestReviewed(event: RoleRequestReviewedEvent) {
    await this.enqueue(
      NotificationEventName.ROLE_REQUEST_REVIEWED,
      event,
      `role-request-reviewed-${event.roleRequestId}-${event.status}`,
    )
  }

  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED, { async: true })
  async handleDriverAssignmentRequestSubmitted(event: DriverAssignmentRequestSubmittedEvent) {
    await this.enqueue(
      NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED,
      event,
      `driver-assignment-submitted-${event.assignmentRequestId}`,
    )
  }

  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, { async: true })
  async handleDriverAssignmentRequestReviewed(event: DriverAssignmentRequestReviewedEvent) {
    await this.enqueue(
      NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED,
      event,
      `driver-assignment-reviewed-${event.assignmentRequestId}-${event.status}`,
    )
  }

  @OnEvent(NotificationEventName.ORDER_CREATED, { async: true })
  async handleOrderCreated(event: OrderCreatedEvent) {
    await this.enqueue(NotificationEventName.ORDER_CREATED, event, `order-created-${event.orderId}`)
  }

  @OnEvent(NotificationEventName.ORDER_STATUS_UPDATED, { async: true })
  async handleOrderStatusUpdated(event: OrderStatusUpdatedEvent) {
    await this.enqueue(
      NotificationEventName.ORDER_STATUS_UPDATED,
      event,
      `order-status-${event.orderId}-${event.status}`,
    )
  }

  @OnEvent(NotificationEventName.SLA_ALERT_CREATED, { async: true })
  async handleSlaAlertCreated(event: unknown) {
    await this.enqueue(NotificationEventName.SLA_ALERT_CREATED, event, this.resolveGenericJobId('sla-created', event))
  }

  @OnEvent(NotificationEventName.SLA_ALERT_RESOLVED, { async: true })
  async handleSlaAlertResolved(event: unknown) {
    await this.enqueue(NotificationEventName.SLA_ALERT_RESOLVED, event, this.resolveGenericJobId('sla-resolved', event))
  }

  @OnEvent(NotificationEventName.COD_COLLECTED, { async: true })
  async handleCodCollected(event: unknown) {
    await this.enqueue(NotificationEventName.COD_COLLECTED, event, this.resolveGenericJobId('cod-collected', event))
  }

  @OnEvent(NotificationEventName.COD_SETTLEMENT_SUBMITTED, { async: true })
  async handleCodSettlementSubmitted(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_SUBMITTED,
      event,
      this.resolveGenericJobId('cod-settlement-submitted', event),
    )
  }

  @OnEvent(NotificationEventName.COD_SETTLEMENT_COMPLETED, { async: true })
  async handleCodSettlementCompleted(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_COMPLETED,
      event,
      this.resolveGenericJobId('cod-settlement-completed', event),
    )
  }

  @OnEvent(NotificationEventName.COD_SETTLEMENT_DISPUTED, { async: true })
  async handleCodSettlementDisputed(event: unknown) {
    await this.enqueue(
      NotificationEventName.COD_SETTLEMENT_DISPUTED,
      event,
      this.resolveGenericJobId('cod-settlement-disputed', event),
    )
  }

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

  private resolveGenericJobId(prefix: string, event: unknown) {
    const record = event && typeof event === 'object' ? (event as Record<string, unknown>) : {}
    const id = record.alertId ?? record.orderId ?? record.batchId ?? record.id ?? Date.now()
    const status = record.status ? `-${String(record.status)}` : ''
    return `${prefix}-${String(id)}${status}`
  }
}
