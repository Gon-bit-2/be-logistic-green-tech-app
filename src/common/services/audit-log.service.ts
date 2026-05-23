import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

/**
 * Service that manages creating system audit logs.
 * Service quản lý việc tạo nhật ký kiểm toán hệ thống (audit log).
 *
 * Tracks administrative actions, entity modifications, and business status changes (like orders, trips).
 * Theo dõi các hoạt động quản trị, sửa đổi thực thể và thay đổi trạng thái nghiệp vụ (như đơn hàng, chuyến đi).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts an audit log record into the database.
   * Chèn một bản ghi nhật ký kiểm toán (audit log) vào cơ sở dữ liệu.
   *
   * Accepts an optional database client or transaction executor to participate in active transactions.
   * Chấp nhận một client cơ sở dữ liệu hoặc bộ thực thi giao dịch tùy chọn để tham gia vào các giao dịch đang hoạt động.
   *
   * @param {object} input - Audit log properties.
   * @param {object} input - Các thuộc tính của nhật ký kiểm toán.
   * @param {string} input.action - The log action name (e.g., 'ORDER_STATUS_CHANGED').
   * @param {string} input.action - Tên hoạt động log (ví dụ: 'ORDER_STATUS_CHANGED').
   * @param {number | null} [input.actorUserId] - The ID of the user performing the action.
   * @param {number | null} [input.actorUserId] - ID của người dùng thực hiện hoạt động.
   * @param {Prisma.InputJsonValue | null} [input.after] - The state of the entity after the action.
   * @param {Prisma.InputJsonValue | null} [input.after] - Trạng thái của thực thể sau khi hoạt động diễn ra.
   * @param {Prisma.InputJsonValue | null} [input.before] - The state of the entity before the action.
   * @param {Prisma.InputJsonValue | null} [input.before] - Trạng thái của thực thể trước khi hoạt động diễn ra.
   * @param {number | string} input.entityId - The unique identifier of the target entity.
   * @param {number | string} input.entityId - Định danh duy nhất của thực thể mục tiêu.
   * @param {string} input.entityType - The class/model of the entity (e.g., 'ORDER', 'TRIP').
   * @param {string} input.entityType - Lớp/model của thực thể (ví dụ: 'ORDER', 'TRIP').
   * @param {Prisma.InputJsonValue | null} [input.metadata] - Extra key-value metadata to attach.
   * @param {Prisma.InputJsonValue | null} [input.metadata] - Metadata bổ sung đính kèm dưới dạng key-value.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   * @param {PrismaExecutor} [client] - Client giao dịch Prisma tùy chọn đang hoạt động.
   * @returns Resolves to the created AuditLog database record, or null if writing failed.
   * @returns Bản ghi cơ sở dữ liệu AuditLog đã tạo, hoặc null nếu việc ghi thất bại.
   */
  async record(
    input: {
      action: string
      actorUserId?: number | null
      after?: Prisma.InputJsonValue | null
      before?: Prisma.InputJsonValue | null
      entityId: number | string
      entityType: string
      metadata?: Prisma.InputJsonValue | null
    },
    client?: PrismaExecutor,
  ) {
    try {
      const db = client ?? this.prisma
      return await db.auditLog.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          after: input.after ?? Prisma.JsonNull,
          before: input.before ?? Prisma.JsonNull,
          entityId: String(input.entityId),
          entityType: input.entityType,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      })
    } catch (error) {
      this.logger.warn(`Audit log write failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
}
