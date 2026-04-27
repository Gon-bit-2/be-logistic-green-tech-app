import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationEventName } from '../events/notification.event'
import type {
  DriverAssignmentRequestReviewedEvent,
  DriverAssignmentRequestSubmittedEvent,
  OrderCreatedEvent,
  OrderStatusUpdatedEvent,
  RoleRequestReviewedEvent,
  RoleRequestSubmittedEvent,
} from '../events/notification.event'
import { NotificationService } from '../service/notification.service'

@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name)

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(NotificationEventName.ROLE_REQUEST_SUBMITTED, { async: true })
  async handleRoleRequestSubmitted(event: RoleRequestSubmittedEvent) {
    try {
      await this.notificationService.createRoleRequestSubmittedNotifications(event)
    } catch (error) {
      this.logger.error(
        `Failed to create submitted role request notifications for roleRequestId=${event.roleRequestId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  @OnEvent(NotificationEventName.ROLE_REQUEST_REVIEWED, { async: true })
  async handleRoleRequestReviewed(event: RoleRequestReviewedEvent) {
    try {
      await this.notificationService.createRoleRequestReviewedNotification(event)
    } catch (error) {
      this.logger.error(
        `Failed to create reviewed role request notification for roleRequestId=${event.roleRequestId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED, { async: true })
  async handleDriverAssignmentRequestSubmitted(event: DriverAssignmentRequestSubmittedEvent) {
    try {
      await this.notificationService.createDriverAssignmentRequestSubmittedNotifications(event)
    } catch (error) {
      this.logger.error(
        `Failed to create driver assignment submitted notifications for request=${event.assignmentRequestId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  @OnEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, { async: true })
  async handleDriverAssignmentRequestReviewed(event: DriverAssignmentRequestReviewedEvent) {
    try {
      await this.notificationService.createDriverAssignmentRequestReviewedNotification(event)
    } catch (error) {
      this.logger.error(
        `Failed to create driver assignment reviewed notification for request=${event.assignmentRequestId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  @OnEvent(NotificationEventName.ORDER_CREATED, { async: true })
  async handleOrderCreated(event: OrderCreatedEvent) {
    try {
      await this.notificationService.createOrderCreatedNotification(event)
    } catch (error) {
      this.logger.error(
        `Failed to create order-created notification for orderId=${event.orderId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  @OnEvent(NotificationEventName.ORDER_STATUS_UPDATED, { async: true })
  async handleOrderStatusUpdated(event: OrderStatusUpdatedEvent) {
    try {
      await this.notificationService.createOrderStatusNotification(event)
    } catch (error) {
      this.logger.error(
        `Failed to create order-status notification for orderId=${event.orderId}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }
}
