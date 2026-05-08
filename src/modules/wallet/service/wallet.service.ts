import { randomUUID } from 'crypto'
import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Optional } from '@nestjs/common'
import { WalletRepository } from '@src/modules/wallet/repository/wallet.repo'
import { PrismaService } from '@src/database/prisma.service'
import { CodSettlementService } from '@src/common/services/cod-settlement.service'
import roleName from '@src/common/constants/role.constant'
import type { AccessTokenPayload } from '@src/common/types/jwt.type'
import type {
  CompleteSettlementBatchDto,
  CreateSettlementBatchDto,
  DisputeSettlementBatchDto,
  ListSettlementBatchesQueryDto,
  OutstandingCodQueryDto,
} from '../dto/wallet.dto'
import { CodSettlementBatchStatus } from 'generated/prisma'
import { NotificationEmitterService } from '@src/common/services/notification-emitter.service'
import { NotificationEventName } from '@src/modules/notification/events/notification.event'
import { AuditLogService } from '@src/common/services/audit-log.service'

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly codSettlementService: CodSettlementService,
    private readonly notificationEmitter: NotificationEmitterService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async getMyWallet(userId: number) {
    return this.walletRepo.getWalletByUserId(userId)
  }

  async addCodToDriver(driverId: number, orderId: number, amount: number) {
    const result = await this.codSettlementService.collectCodForOrder(orderId, driverId, { amount })
    await this.auditLogService?.record({
      action: 'COD_COLLECTED',
      actorUserId: driverId,
      after: { amount, isCodCollected: true },
      entityId: orderId,
      entityType: 'ORDER',
    })
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, trackingCode: true },
    })
    if (order) {
      await this.notificationEmitter.emitSafe(NotificationEventName.COD_COLLECTED, {
        amount,
        driverId,
        orderId,
        recipientUserIds: await this.resolveCodRecipients(driverId, order.customerId),
        trackingCode: order.trackingCode,
      })
    }
    return result
  }

  async reconcileCodForDriver(
    adminId: number,
    driverId: number,
    amount: number,
    referenceId: string,
    description?: string,
  ) {
    const desc = description || `Đối soát COD bởi Admin #${adminId}`
    try {
      const result = await this.walletRepo.reconcileCod(driverId, amount, referenceId, desc)

      const orderReferenceMatch = /^ORDER_(\d+)$/i.exec(referenceId.trim())
      if (orderReferenceMatch) {
        await this.prisma.order.updateMany({
          where: {
            id: Number(orderReferenceMatch[1]),
            isCodCollected: true,
          },
          data: {
            codReconciledAt: new Date(),
          },
        })
      }

      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Lỗi đối soát COD'
      throw new BadRequestException(message)
    }
  }

  async getOutstandingCod(actor: AccessTokenPayload, query: OutstandingCodQueryDto) {
    const driverId = this.resolveDriverIdForCod(actor, query.driverId)
    await this.assertCanManageDriverCod(actor, driverId)

    return this.walletRepo.findOutstandingCodOrders({
      driverId,
      from: query.from,
      to: query.to,
    })
  }

  async createSettlementBatch(actor: AccessTokenPayload, payload: CreateSettlementBatchDto) {
    await this.assertCanManageDriverCod(actor, payload.driverId)

    const outstandingOrders = await this.walletRepo.findOutstandingCodOrders({
      driverId: payload.driverId,
      from: payload.from,
      to: payload.to,
    })

    // Nếu client truyền orderIds, batch chỉ lấy các order đang outstanding hợp lệ.
    // Điều này ngăn việc nhét order chưa thu COD hoặc đã nằm trong batch khác vào settlement.
    const requestedOrderIds = payload.orderIds?.length ? new Set(payload.orderIds) : null
    const selectedOrders = requestedOrderIds
      ? outstandingOrders.filter((order) => requestedOrderIds.has(order.orderId))
      : outstandingOrders

    if (!selectedOrders.length) {
      throw new BadRequestException('Không có đơn COD hợp lệ để tạo batch đối soát.')
    }

    if (requestedOrderIds && selectedOrders.length !== requestedOrderIds.size) {
      throw new BadRequestException('Một hoặc nhiều đơn không còn khả dụng để đối soát COD.')
    }

    const batch = await this.walletRepo.createSettlementBatch({
      batchCode: this.buildSettlementBatchCode(payload.driverId),
      createdById: actor.userId,
      driverId: payload.driverId,
      note: payload.note,
      orders: selectedOrders,
    })

    if (batch) {
      await this.auditLogService?.record({
        action: 'COD_SETTLEMENT_CREATED',
        actorUserId: actor.userId,
        after: { driverId: batch.driverId, status: batch.status, totalAmount: Number(batch.totalAmount) },
        entityId: batch.id,
        entityType: 'COD_SETTLEMENT_BATCH',
        metadata: { batchCode: batch.batchCode },
      })
      await this.notificationEmitter.emitSafe(NotificationEventName.COD_SETTLEMENT_SUBMITTED, {
        batchCode: batch.batchCode,
        batchId: batch.id,
        driverId: batch.driverId,
        recipientUserIds: await this.resolveCodRecipients(batch.driverId),
        status: 'SUBMITTED',
        totalAmount: Number(batch.totalAmount),
      })
    }

    return batch
  }

  async listSettlementBatches(actor: AccessTokenPayload, query: ListSettlementBatchesQueryDto) {
    const driverId = query.driverId ?? (actor.roleName === roleName.DRIVER ? actor.userId : undefined)
    if (driverId) {
      await this.assertCanManageDriverCod(actor, driverId)
    } else if (actor.roleName !== roleName.ADMIN) {
      throw new ForbiddenException('Error.Forbidden')
    }

    return this.walletRepo.listSettlementBatches({
      driverId,
      from: query.from,
      limit: query.limit,
      page: query.page,
      status: query.status as CodSettlementBatchStatus | undefined,
      to: query.to,
    })
  }

  async getSettlementBatch(actor: AccessTokenPayload, batchId: number) {
    const batch = await this.walletRepo.findSettlementBatchById(batchId)
    if (!batch) throw new NotFoundException('Không tìm thấy batch đối soát COD.')
    await this.assertCanManageDriverCod(actor, batch.driverId)
    return batch
  }

  async completeSettlementBatch(actor: AccessTokenPayload, batchId: number, payload: CompleteSettlementBatchDto) {
    const batch = await this.getSettlementBatch(actor, batchId)
    if (actor.roleName !== roleName.ADMIN && actor.roleName !== roleName.WAREHOUSE_STAFF) {
      throw new ForbiddenException('Error.Forbidden')
    }
    if (batch.status === CodSettlementBatchStatus.CANCELLED || batch.status === CodSettlementBatchStatus.DISPUTED) {
      throw new BadRequestException('Batch đang bị hủy hoặc tranh chấp, không thể hoàn tất đối soát.')
    }

    try {
      const completed = await this.walletRepo.completeSettlementBatch({
        batchId,
        completedById: actor.userId,
        note: payload.note,
      })
      if (!completed) throw new NotFoundException('Không tìm thấy batch đối soát COD.')
      await this.auditLogService?.record({
        action: 'COD_SETTLEMENT_COMPLETED',
        actorUserId: actor.userId,
        after: { status: completed.status, totalAmount: Number(completed.totalAmount) },
        before: { status: batch.status },
        entityId: completed.id,
        entityType: 'COD_SETTLEMENT_BATCH',
        metadata: { batchCode: completed.batchCode },
      })
      await this.notificationEmitter.emitSafe(NotificationEventName.COD_SETTLEMENT_COMPLETED, {
        batchCode: completed.batchCode,
        batchId: completed.id,
        driverId: completed.driverId,
        recipientUserIds: await this.resolveCodRecipients(completed.driverId),
        status: 'COMPLETED',
        totalAmount: Number(completed.totalAmount),
      })
      return this.walletRepo.findSettlementBatchById(batchId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Lỗi hoàn tất batch đối soát COD'
      throw new BadRequestException(message)
    }
  }

  async disputeSettlementBatch(actor: AccessTokenPayload, batchId: number, payload: DisputeSettlementBatchDto) {
    await this.getSettlementBatch(actor, batchId)
    if (actor.roleName !== roleName.ADMIN && actor.roleName !== roleName.WAREHOUSE_STAFF) {
      throw new ForbiddenException('Error.Forbidden')
    }

    const disputed = await this.walletRepo.disputeSettlementBatch({
      batchId,
      itemIds: payload.itemIds,
      reason: payload.reason,
    })
    if (!disputed) throw new NotFoundException('Không tìm thấy batch đối soát COD.')
    await this.auditLogService?.record({
      action: 'COD_SETTLEMENT_DISPUTED',
      actorUserId: actor.userId,
      after: { status: disputed.status },
      entityId: disputed.id,
      entityType: 'COD_SETTLEMENT_BATCH',
      metadata: { batchCode: disputed.batchCode, itemIds: payload.itemIds ?? null, reason: payload.reason },
    })
    await this.notificationEmitter.emitSafe(NotificationEventName.COD_SETTLEMENT_DISPUTED, {
      batchCode: disputed.batchCode,
      batchId: disputed.id,
      driverId: disputed.driverId,
      recipientUserIds: await this.resolveCodRecipients(disputed.driverId),
      status: 'DISPUTED',
      totalAmount: Number(disputed.totalAmount),
    })
    return this.walletRepo.findSettlementBatchById(batchId)
  }

  async exportSettlementBatchCsv(actor: AccessTokenPayload, batchId: number) {
    const batch = await this.getSettlementBatch(actor, batchId)

    // CSV v1 cố ý giữ format đơn giản, ổn định để kế toán import Excel/Google Sheets
    // và không cần thêm dependency PDF/stream lớn trong phase đầu.
    const rows = [
      ['Batch Code', batch.batchCode],
      ['Driver', batch.driver.fullName],
      ['Status', batch.status],
      ['Total Amount', String(batch.totalAmount)],
      ['Order Count', String(batch.orderCount)],
      [],
      ['Order ID', 'Tracking Code', 'Amount', 'Item Status', 'Collected At', 'Reconciled At', 'Dispute Reason'],
      ...batch.items.map((item) => [
        String(item.orderId),
        item.order.trackingCode,
        String(item.amount),
        item.status,
        item.order.codCollectedAt?.toISOString() ?? '',
        item.order.codReconciledAt?.toISOString() ?? '',
        item.disputeReason ?? '',
      ]),
    ]

    return rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\r\n')
  }

  private resolveDriverIdForCod(actor: AccessTokenPayload, requestedDriverId?: number) {
    if (actor.roleName === roleName.DRIVER) {
      if (requestedDriverId && requestedDriverId !== actor.userId) {
        throw new ForbiddenException('Error.Forbidden')
      }
      return actor.userId
    }

    if (!requestedDriverId) {
      throw new BadRequestException('driverId là bắt buộc với Admin/Warehouse Staff.')
    }

    return requestedDriverId
  }

  private async assertCanManageDriverCod(actor: AccessTokenPayload, driverId: number) {
    if (actor.roleName === roleName.ADMIN) return
    if (actor.roleName === roleName.DRIVER && actor.userId === driverId) return

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const driver = await this.prisma.user.findUnique({
        where: { id: driverId },
        select: { hubId: true },
      })

      // Staff chỉ được quản lý COD của tài xế cùng hub để tránh đối soát nhầm tiền giữa kho.
      if (driver?.hubId && actor.hubId && driver.hubId === actor.hubId) return
    }

    throw new ForbiddenException('Error.Forbidden')
  }

  private buildSettlementBatchCode(driverId: number) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `COD-${datePart}-D${driverId}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  private async resolveCodRecipients(driverId: number, customerId?: number) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { hubId: true },
    })
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        OR: [
          { id: driverId },
          ...(customerId ? [{ id: customerId }] : []),
          { role: { name: roleName.ADMIN } },
          ...(driver?.hubId ? [{ hubId: driver.hubId, role: { name: roleName.WAREHOUSE_STAFF } }] : []),
        ],
      },
      select: { id: true },
    })

    return users.map((user) => user.id)
  }

  private escapeCsvCell(value: string) {
    if (!/[",\r\n]/.test(value)) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
