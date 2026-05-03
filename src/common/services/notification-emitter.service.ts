import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

/**
 * Service chung để phát sự kiện notification một cách an toàn (fire-and-forget).
 * Thay thế các private method `emitNotificationEvent()` bị duplicate
 * ở nhiều service (Orders, Tracking, Trips, Role).
 *
 * - Không throw exception khi notification thất bại → tránh block luồng chính.
 * - Log warning để Admin theo dõi nếu có sự cố.
 */
@Injectable()
export class NotificationEmitterService {
  private readonly logger = new Logger(NotificationEmitterService.name)

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Phát sự kiện notification an toàn — không throw exception nếu listener lỗi.
   * @param eventName Tên event (từ NotificationEventName)
   * @param payload Dữ liệu kèm theo event
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
