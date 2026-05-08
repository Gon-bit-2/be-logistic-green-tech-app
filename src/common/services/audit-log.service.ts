import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'

type PrismaExecutor = PrismaService | Prisma.TransactionClient

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(private readonly prisma: PrismaService) {}

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
