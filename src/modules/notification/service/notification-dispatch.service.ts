import { Injectable } from '@nestjs/common'
import { NotificationRepository } from '../repository/notification.repo'
import type { NotificationDomainEvent } from '../events/notification.event'
import { NotificationEnvelopeMapper } from './notification-envelope.mapper'

export type NotificationDispatchResult = {
  deliveryId: number | null
  notification: Awaited<ReturnType<NotificationRepository['createForUserIdempotent']>> | null
  status: 'PENDING' | 'SKIPPED'
  userId: number
}

@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly envelopeMapper: NotificationEnvelopeMapper,
  ) {}

  async dispatchDomainEvent(eventName: string, payload: NotificationDomainEvent, attemptCount = 0) {
    const envelope = this.envelopeMapper.buildEnvelope(eventName, payload)
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
}
