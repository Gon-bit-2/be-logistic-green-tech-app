import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'
import { GetNotificationsQueryType, NotificationPayloadType } from '../model/notification.model'
import { NotificationTypeValue } from 'src/common/constants/notification.constant'

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
