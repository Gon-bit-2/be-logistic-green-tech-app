import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { NOTIFICATION_QUEUE_NAME, DELIVER_NOTIFICATION_JOB_NAME } from 'src/common/constants/queue.constant'
import { NotificationGateway } from '../gateway/notification.gateway'
import { NotificationRepository } from '../repository/notification.repo'
import { NotificationService } from '../service/notification.service'
import type { NotificationQueueJobData } from '../listener/notification.event.listener'
import type { NotificationDomainEvent } from '../events/notification.event'

/**
 * BullMQ Worker Processor for handling background notification queue jobs.
 * 
 * Worker Processor của BullMQ để xử lý các công việc gửi thông báo chạy ngầm trong hàng đợi.
 */
@Processor(NOTIFICATION_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name)

  /**
   * Initializes the NotificationProcessor.
   * 
   * Khởi tạo NotificationProcessor.
   * 
   * @param notificationService - Core Notification Service / Dịch vụ Thông báo cốt lõi.
   * @param notificationRepository - Database operations for Notifications / Thao tác cơ sở dữ liệu cho Thông báo.
   * @param notificationGateway - Real-time WebSocket communications / Giao tiếp WebSocket thời gian thực.
   */
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super()
  }

  /**
   * Processes a notification background job from BullMQ.
   * Dispatches domain events, stores notification records, sends real-time socket events, and updates delivery statuses.
   * 
   * Xử lý công việc gửi thông báo chạy ngầm từ BullMQ.
   * Phát đi các sự kiện domain, lưu trữ bản ghi thông báo, gửi sự kiện socket thời gian thực, và cập nhật trạng thái phân phối.
   * 
   * @param job - The BullMQ job object containing notification event metadata / Đối tượng job BullMQ chứa siêu dữ liệu sự kiện thông báo.
   * @returns Processing statistics including number of delivered and skipped notifications / Thống kê xử lý gồm số thông báo đã gửi và đã bỏ qua.
   */
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

  /**
   * Calculates the next retry timestamp using an exponential backoff formula.
   * 
   * Tính toán thời gian thử lại tiếp theo sử dụng công thức exponential backoff.
   * 
   * @param attemptsMade - The number of failed attempts already made / Số lần thử thất bại đã thực hiện.
   * @returns Date object representing the next retry time / Đối tượng Date đại diện cho thời gian thử lại tiếp theo.
   */
  private nextRetryAt(attemptsMade: number) {
    const delayMs = Math.min(60_000, 5000 * 2 ** attemptsMade)
    return new Date(Date.now() + delayMs)
  }
}
