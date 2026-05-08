import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'
import { GetNotificationsQueryType, NotificationPayloadType } from '../model/notification.model'
import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationTypeValue,
} from 'src/common/constants/notification.constant'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(client?: PrismaExecutor) {
    return client ?? this.prisma
  }

  async createManyForUsers(
    userIds: number[],
    input: {
      type: NotificationTypeValue
      title: string
      message: string
      payload?: NotificationPayloadType
    },
    client?: PrismaExecutor,
  ) {
    if (userIds.length === 0) {
      return { count: 0 }
    }

    return await this.getClient(client).notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        payload: input.payload ? (input.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
    })
  }

  async findPreference(userId: number, type: NotificationTypeValue, client?: PrismaExecutor) {
    return await this.getClient(client).notificationPreference.findUnique({
      where: {
        userId_type: {
          type,
          userId,
        },
      },
    })
  }

  async listPreferences(userId: number) {
    return await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    })
  }

  async upsertPreferences(
    userId: number,
    preferences: { inAppEnabled: boolean; type: NotificationTypeValue }[],
  ) {
    return await this.prisma.$transaction(
      preferences.map((preference) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_type: {
              type: preference.type,
              userId,
            },
          },
          create: {
            inAppEnabled: preference.inAppEnabled,
            type: preference.type,
            userId,
          },
          update: {
            inAppEnabled: preference.inAppEnabled,
          },
        }),
      ),
    )
  }

  async createForUserIdempotent(
    userId: number,
    input: {
      dedupeKey?: string
      message: string
      payload?: NotificationPayloadType | Record<string, unknown>
      title: string
      type: NotificationTypeValue
    },
    client?: PrismaExecutor,
  ) {
    const data = {
      dedupeKey: input.dedupeKey,
      message: input.message,
      payload: input.payload ? (input.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      title: input.title,
      type: input.type,
      userId,
    }

    if (!input.dedupeKey) {
      return await this.getClient(client).notification.create({ data })
    }

    return await this.getClient(client).notification.upsert({
      where: {
        userId_dedupeKey: {
          dedupeKey: input.dedupeKey,
          userId,
        },
      },
      create: data,
      update: {
        message: input.message,
        payload: data.payload,
        title: input.title,
        type: input.type,
      },
    })
  }

  async createDelivery(
    input: {
      attemptCount?: number
      lastError?: string | null
      nextRetryAt?: Date | null
      notificationId?: number | null
      status?: keyof typeof NotificationDeliveryStatus
      userId: number
    },
    client?: PrismaExecutor,
  ) {
    return await this.getClient(client).notificationDelivery.create({
      data: {
        attemptCount: input.attemptCount ?? 0,
        channel: NotificationDeliveryChannel.IN_APP,
        lastError: input.lastError ?? null,
        nextRetryAt: input.nextRetryAt ?? null,
        notificationId: input.notificationId ?? null,
        status: input.status ?? NotificationDeliveryStatus.PENDING,
        userId: input.userId,
      },
    })
  }

  async markDeliverySent(deliveryId: number) {
    return await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        deliveredAt: new Date(),
        status: NotificationDeliveryStatus.SENT,
      },
    })
  }

  async markDeliveryFailed(deliveryId: number, error: string, nextRetryAt?: Date) {
    return await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        lastError: error,
        nextRetryAt: nextRetryAt ?? null,
        status: NotificationDeliveryStatus.FAILED,
      },
    })
  }

  async findManyByUser(userId: number, query: GetNotificationsQueryType) {
    const { page, limit, isRead } = query
    const skip = (page - 1) * limit
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(typeof isRead === 'boolean' ? { isRead } : {}),
    }

    const [data, totalItems] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ])

    return { data, totalItems }
  }

  async countUnreadByUser(userId: number) {
    return await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    })
  }

  async findByIdForUser(userId: number, id: number) {
    return await this.prisma.notification.findFirst({
      where: {
        id,
        userId,
      },
    })
  }

  async markAsRead(userId: number, id: number) {
    return await this.prisma.notification.updateMany({
      where: {
        id,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })
  }

  async markAllAsRead(userId: number) {
    return await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })
  }
}
