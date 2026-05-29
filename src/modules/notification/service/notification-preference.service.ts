import { Injectable } from '@nestjs/common'
import { NotificationRepository } from '../repository/notification.repo'
import { UpdateNotificationPreferencesType } from '../model/notification.model'

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async getPreferences(userId: number) {
    const data = await this.notificationRepository.listPreferences(userId)
    return { data }
  }

  async updatePreferences(userId: number, payload: UpdateNotificationPreferencesType) {
    const data = await this.notificationRepository.upsertPreferences(userId, payload.preferences)
    return { data }
  }
}
