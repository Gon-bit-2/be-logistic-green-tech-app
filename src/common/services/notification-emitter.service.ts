import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

/**
 * Common service to safely emit notification events in a fire-and-forget manner.
 * Service chung để phát sự kiện notification một cách an toàn (fire-and-forget).
 *
 * Replaces duplicate private methods like `emitNotificationEvent()` across multiple services
 * (e.g. Orders, Tracking, Trips, Role).
 * Thay thế các private method `emitNotificationEvent()` bị duplicate
 * ở nhiều service (Orders, Tracking, Trips, Role).
 *
 * - Does not throw exceptions if notification fails, ensuring main business flows are not blocked.
 * - Logs warnings for administrators to trace issues if they occur.
 *
 * - Không throw exception khi notification thất bại → tránh block luồng chính.
 * - Log warning để Admin theo dõi nếu có sự cố.
 */
@Injectable()
export class NotificationEmitterService {
  private readonly logger = new Logger(NotificationEmitterService.name)

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Safely emits a notification event — does not throw exceptions if the listener fails.
   * Phát sự kiện notification an toàn — không throw exception nếu listener lỗi.
   *
   * @param {string} eventName - The event name (from NotificationEventName).
   * @param {string} eventName - Tên event (từ NotificationEventName).
   * @param {unknown} payload - The payload data associated with the event.
   * @param {unknown} payload - Dữ liệu kèm theo event.
   * @returns {Promise<void>}
   */
  async emitSafe(eventName: string, payload: unknown): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(eventName, payload)
    } catch (error) {
      this.logger.warn(
        `Notification event failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
