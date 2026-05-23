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

/**
 * Repository handling database operations for the Notification module.
 * 
 * Kho lưu trữ xử lý các hoạt động cơ sở dữ liệu cho module Thông báo.
 */
@Injectable()
export class NotificationRepository {
  /**
   * Initializes the NotificationRepository.
   * 
   * Khởi tạo NotificationRepository.
   * 
   * @param prisma - Database service instance / Instance của dịch vụ cơ sở dữ liệu.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to get database client (either active transaction or default prisma service).
   * 
   * Trình hỗ trợ để lấy client cơ sở dữ liệu (giao dịch đang hoạt động hoặc dịch vụ prisma mặc định).
   * 
   * @param client - Optional active prisma client or transaction executor / Client prisma hoặc đối tượng thực thi transaction tùy chọn.
   * @returns Active Prisma client / Client Prisma đang hoạt động.
   */
  private getClient(client?: PrismaExecutor) {
    return client ?? this.prisma
  }

  /**
   * Creates multiple notifications in bulk for a list of users.
   * 
   * Tạo hàng loạt nhiều thông báo cho một danh sách người dùng.
   * 
   * @param userIds - List of user IDs / Danh sách ID người dùng.
   * @param input - Notification details including type, title, message and payload / Chi tiết thông báo bao gồm loại, tiêu đề, thông điệp và dữ liệu đi kèm.
   * @param client - Optional database executor / Đối tượng thực thi cơ sở dữ liệu tùy chọn.
   * @returns Object containing the count of created notifications / Đối tượng chứa số lượng thông báo đã tạo.
   */
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

  /**
   * Finds notification preference of a specific type for a user.
   * 
   * Tìm kiếm cấu hình nhận thông báo theo loại cụ thể của người dùng.
   * 
   * @param userId - User ID / ID người dùng.
   * @param type - Notification type value / Loại thông báo.
   * @param client - Optional database executor / Đối tượng thực thi cơ sở dữ liệu tùy chọn.
   * @returns User notification preference or null if not found / Cấu hình nhận thông báo của người dùng hoặc null nếu không tìm thấy.
   */
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

  /**
   * Lists all notification preferences for a specific user.
   * 
   * Danh sách tất cả các cấu hình nhận thông báo của một người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @returns Array of user notification preferences / Mảng các cấu hình nhận thông báo của người dùng.
   */
  async listPreferences(userId: number) {
    return await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    })
  }

  /**
   * Creates or updates notification preferences for a user in a transaction.
   * 
   * Tạo mới hoặc cập nhật danh sách cấu hình nhận thông báo cho người dùng trong một transaction.
   * 
   * @param userId - User ID / ID người dùng.
   * @param preferences - List of preferences to upsert / Danh sách các cấu hình cần upsert.
   * @returns Transaction response with list of updated preferences / Kết quả transaction chứa danh sách các cấu hình đã được cập nhật.
   */
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

  /**
   * Creates a notification with deduplication (idempotent creation).
   * 
   * Tạo thông báo với cơ chế loại bỏ trùng lặp (tạo idempotent).
   * 
   * @param userId - Target User ID / ID người dùng đích.
   * @param input - Notification details including dedupe key / Chi tiết thông báo bao gồm khóa loại bỏ trùng lặp.
   * @param client - Optional database executor / Đối tượng thực thi cơ sở dữ liệu tùy chọn.
   * @returns Created or updated notification / Thông báo đã được tạo hoặc cập nhật.
   */
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

  /**
   * Creates a delivery record for a notification.
   * 
   * Tạo một bản ghi trạng thái phân phối cho thông báo.
   * 
   * @param input - Delivery details / Chi tiết phân phối thông báo.
   * @param client - Optional database executor / Đối tượng thực thi cơ sở dữ liệu tùy chọn.
   * @returns Created notification delivery record / Bản ghi phân phối thông báo được tạo.
   */
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

  /**
   * Marks a notification delivery as successfully sent.
   * 
   * Đánh dấu bản ghi phân phối thông báo là đã gửi thành công.
   * 
   * @param deliveryId - Delivery record ID / ID bản ghi phân phối.
   * @returns Updated delivery record / Bản ghi phân phối đã cập nhật.
   */
  async markDeliverySent(deliveryId: number) {
    return await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        deliveredAt: new Date(),
        status: NotificationDeliveryStatus.SENT,
      },
    })
  }

  /**
   * Marks a notification delivery as failed with error details.
   * 
   * Đánh dấu bản ghi phân phối thông báo là thất bại với chi tiết lỗi.
   * 
   * @param deliveryId - Delivery record ID / ID bản ghi phân phối.
   * @param error - Error message / Nội dung thông báo lỗi.
   * @param nextRetryAt - Optional next retry date / Thời gian thử lại tiếp theo tùy chọn.
   * @returns Updated delivery record / Bản ghi phân phối đã cập nhật.
   */
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

  /**
   * Finds notifications for a specific user with pagination and filters.
   * 
   * Tìm kiếm các thông báo của một người dùng cụ thể với phân trang và bộ lọc.
   * 
   * @param userId - User ID / ID người dùng.
   * @param query - Pagination and filter query details / Chi tiết phân trang và bộ lọc truy vấn.
   * @returns Paginated list of notifications and total count / Danh sách thông báo được phân trang và tổng số lượng.
   */
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

  /**
   * Counts the number of unread notifications for a specific user.
   * 
   * Đếm số lượng thông báo chưa đọc của một người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @returns Count of unread notifications / Số lượng thông báo chưa đọc.
   */
  async countUnreadByUser(userId: number) {
    return await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    })
  }

  /**
   * Finds a specific notification by ID for a specific user.
   * 
   * Tìm kiếm một thông báo cụ thể theo ID cho một người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @param id - Notification ID / ID thông báo.
   * @returns Found notification or null if not found / Thông báo tìm thấy hoặc null nếu không tìm thấy.
   */
  async findByIdForUser(userId: number, id: number) {
    return await this.prisma.notification.findFirst({
      where: {
        id,
        userId,
      },
    })
  }

  /**
   * Marks a specific notification as read for a specific user.
   * 
   * Đánh dấu một thông báo cụ thể là đã đọc cho một người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @param id - Notification ID / ID thông báo.
   * @returns Update count details / Chi tiết số bản ghi đã cập nhật.
   */
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

  /**
   * Marks all unread notifications as read for a specific user.
   * 
   * Đánh dấu toàn bộ thông báo chưa đọc là đã đọc cho một người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @returns Update count details / Chi tiết số bản ghi đã cập nhật.
   */
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
