import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { NOTIFICATION_QUEUE_NAME, DELIVER_NOTIFICATION_JOB_NAME } from 'src/common/constants/queue.constant'
import { NotificationGateway } from '../gateway/notification.gateway'
import { NotificationRepository } from '../repository/notification.repo'
import { NotificationService } from '../service/notification.service'
import type { NotificationQueueJobData } from '../listener/notification.event.listener'
import type { NotificationDomainEvent } from '../events/notification.event'

@Processor(NOTIFICATION_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super()
  }

  async process(job: Job<NotificationQueueJobData>) {
    if (job.name !== DELIVER_NOTIFICATION_JOB_NAME) return

    const results = await this.notificationService.dispatchDomainEvent(
      job.data.eventName,
      job.data.payload as NotificationDomainEvent,
      job.attemptsMade + 1,
    )

    for (const result of results) {
      if (!result.notification || !result.deliveryId) continue

      try {
        const emitted = this.notificationGateway.emitNotificationCreated(result.userId, result.notification)
        const unread = await this.notificationService.getUnreadCount(result.userId)
        this.notificationGateway.emitUnreadCount(result.userId, unread.totalUnread)

        if (emitted) {
          await this.notificationRepository.markDeliverySent(result.deliveryId)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.notificationRepository.markDeliveryFailed(result.deliveryId, message, this.nextRetryAt(job.attemptsMade))
        this.logger.warn(`Notification realtime emit failed for userId=${result.userId}: ${message}`)
        throw error
      }
    }

    return { delivered: results.filter((result) => result.notification).length, skipped: results.filter((result) => !result.notification).length }
  }

  private nextRetryAt(attemptsMade: number) {
    const delayMs = Math.min(60_000, 5000 * 2 ** attemptsMade)
    return new Date(Date.now() + delayMs)
  }
}
