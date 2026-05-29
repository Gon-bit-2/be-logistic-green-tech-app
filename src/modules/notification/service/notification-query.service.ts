import { Injectable, NotFoundException } from '@nestjs/common'
import { NotificationRepository } from '../repository/notification.repo'
import { GetNotificationsQueryType } from '../model/notification.model'

@Injectable()
export class NotificationQueryService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async findAll(userId: number, query: GetNotificationsQueryType) {
    return this.notificationRepository.findManyByUser(userId, query)
  }

  async getUnreadCount(userId: number) {
    const totalUnread = await this.notificationRepository.countUnreadByUser(userId)
    return { totalUnread }
  }

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

  async markAllAsRead(userId: number) {
    await this.notificationRepository.markAllAsRead(userId)
    return {
      message: 'Đánh dấu tất cả thông báo đã đọc thành công',
    }
  }
}
