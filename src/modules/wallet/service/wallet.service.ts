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

/**
 * Service managing driver digital wallets, COD cash flows, and batch financial reconciliations.
 * Handles auditing, domain events triggering, real-time alerts, and exporting settlement data to CSV.
 * 
 * Dịch vụ quản lý ví điện tử tài xế, dòng tiền mặt COD và đối soát các lô tài chính.
 * Xử lý ghi log kiểm toán, kích hoạt sự kiện domain, phát cảnh báo thời gian thực và xuất dữ liệu quyết toán sang CSV.
 */
@Injectable()
export class WalletService {
  /**
   * Initializes the WalletService.
   * 
   * Khởi tạo WalletService.
   * 
   * @param walletRepo - Wallet Repository / Repository quản lý ví.
   * @param prisma - Prisma Database Service / Dịch vụ cơ sở dữ liệu Prisma.
   * @param codSettlementService - COD Settlement Service / Dịch vụ quyết toán COD.
   * @param notificationEmitter - Notification Emitter Service / Dịch vụ phát thông báo.
   * @param auditLogService - Optional Audit Log Service / Dịch vụ ghi log kiểm toán tùy chọn.
   */
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly codSettlementService: CodSettlementService,
    private readonly notificationEmitter: NotificationEmitterService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Retrieves the wallet of a specific driver user.
   * 
   * Lấy chi tiết thông tin ví của một tài xế cụ thể.
   * 
   * @param userId - Driver User ID / ID người dùng của tài xế.
   * @returns Driver wallet details / Chi tiết thông tin ví tài xế.
   */
  async getMyWallet(userId: number) {
    return this.walletRepo.getWalletByUserId(userId)
  }

  /**
   * Confirms driver collection of cash COD for an order and logs the transaction.
   * Triggers background notification alerts.
   * 
   * Xác nhận tài xế đã thu tiền COD mặt cho đơn hàng và ghi nhận giao dịch.
   * Kích hoạt các thông báo cảnh báo chạy ngầm.
   * 
   * @param driverId - Driver User ID / ID người dùng của tài xế.
   * @param orderId - Order ID / ID đơn hàng.
   * @param amount - Collected amount / Số tiền đã thu.
   * @returns Updated driver wallet details / Chi tiết ví tài xế sau cập nhật.
   */
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

  /**
   * Reconciles driver's collected cash. Reduces pending balance inside the wallet database.
   * Also updates order reconciliation states.
   * 
   * Quyết toán và đối soát số tiền mặt thu được của tài xế. Giảm số dư chờ xử lý trong cơ sở dữ liệu ví.
   * Đồng thời cập nhật trạng thái đối soát của đơn hàng liên quan.
   * 
   * @param adminId - Admin ID performing reconciliation / ID của admin thực hiện đối soát.
   * @param driverId - Target Driver User ID / ID tài xế đích.
   * @param amount - Amount to reconcile / Số tiền đối soát.
   * @param referenceId - Matching transaction reference / Mã tham chiếu giao dịch phù hợp.
   * @param description - Optional description notes / Ghi chú mô tả tùy chọn.
   * @returns Updated driver wallet details / Chi tiết ví tài xế sau cập nhật.
   * @throws BadRequestException if database operation fails / BadRequestException nếu thao tác cơ sở dữ liệu thất bại.
   */
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

  /**
   * Finds outstanding COD orders for a specific driver within a time range.
   * 
   * Tìm kiếm các đơn hàng COD tồn đọng của một tài xế cụ thể trong khoảng thời gian.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param query - Date range and target driver options / Các tiêu chí khoảng thời gian và tài xế.
   * @returns List of outstanding COD orders / Danh sách đơn hàng COD tồn đọng.
   */
  async getOutstandingCod(actor: AccessTokenPayload, query: OutstandingCodQueryDto) {
    const driverId = this.resolveDriverIdForCod(actor, query.driverId)
    await this.assertCanManageDriverCod(actor, driverId)

    return this.walletRepo.findOutstandingCodOrders({
      driverId,
      from: query.from,
      to: query.to,
    })
  }

  /**
   * Creates a new financial settlement batch with selected outstanding COD orders.
   * Logs audit events and fires notification alerts.
   * 
   * Tạo một lô/đợt quyết toán tài chính mới với các đơn hàng COD tồn đọng được chọn.
   * Ghi log kiểm toán và phát đi thông báo cảnh báo.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param payload - Driver ID, date range, and selected order list / ID tài xế, khoảng thời gian và danh sách đơn hàng được chọn.
   * @returns Detailed information of the newly created batch / Chi tiết thông tin của lô vừa được tạo.
   * @throws BadRequestException if there are no eligible orders / BadRequestException nếu không có đơn hàng hợp lệ để đối soát.
   */
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

  /**
   * Retrieves paginated lists of COD settlement batches matching criteria.
   * 
   * Lấy danh sách phân trang các lô quyết toán COD khớp với tiêu chí.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param query - Filter options / Các bộ lọc truy vấn.
   * @returns Paginated list of settlement batches / Danh sách phân trang các lô quyết toán.
   * @throws ForbiddenException if a non-admin tries to list batches globally / ForbiddenException nếu tài khoản không phải admin cố gắng lấy danh sách toàn cục.
   */
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

  /**
   * Retrieves detailed information of a specific COD settlement batch by ID.
   * 
   * Lấy chi tiết thông tin của một lô quyết toán COD cụ thể theo ID.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param batchId - Settlement batch ID / ID lô quyết toán.
   * @returns Detailed settlement batch details / Chi tiết thông tin của lô quyết toán.
   * @throws NotFoundException if the batch doesn't exist / NotFoundException nếu không tìm thấy lô quyết toán.
   */
  async getSettlementBatch(actor: AccessTokenPayload, batchId: number) {
    const batch = await this.walletRepo.findSettlementBatchById(batchId)
    if (!batch) throw new NotFoundException('Không tìm thấy batch đối soát COD.')
    await this.assertCanManageDriverCod(actor, batch.driverId)
    return batch
  }

  /**
   * Approves and completes a COD settlement batch. Decreases outstanding amounts and logs audit events.
   * 
   * Phê duyệt và hoàn tất một lô quyết toán COD. Giảm các khoản tồn đọng và ghi lại log kiểm toán.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param batchId - Settlement batch ID / ID lô quyết toán.
   * @param payload - Completion notes / Ghi chú hoàn tất.
   * @returns Detailed info of the completed batch / Thông tin chi tiết lô quyết toán sau khi hoàn tất.
   * @throws ForbiddenException if user permissions are insufficient / ForbiddenException nếu người dùng không đủ thẩm quyền.
   * @throws BadRequestException if batch status is cancelled or disputed / BadRequestException nếu lô quyết toán đang bị hủy hoặc tranh chấp.
   */
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

  /**
   * Places a settlement batch in a disputed state.
   * 
   * Đưa lô quyết toán vào trạng thái tranh chấp.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param batchId - Settlement batch ID / ID lô quyết toán.
   * @param payload - Dispute reason and list of affected items / Lý do tranh chấp và danh sách các mục bị ảnh hưởng.
   * @returns Detailed info of the disputed batch / Chi tiết thông tin của lô quyết toán bị tranh chấp.
   * @throws ForbiddenException if user permissions are insufficient / ForbiddenException nếu người dùng không đủ thẩm quyền.
   * @throws NotFoundException if batch doesn't exist / NotFoundException nếu không tìm thấy lô quyết toán.
   */
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

  /**
   * Formats a COD settlement batch details and order entries into a CSV-encoded string.
   * 
   * Định dạng chi tiết lô quyết toán COD và danh sách các đơn hàng thành một chuỗi mã hóa CSV.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param batchId - Settlement batch ID / ID lô quyết toán.
   * @returns CSV-encoded string representing batch details / Chuỗi mã hóa CSV đại diện cho thông tin lô quyết toán.
   */
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

  /**
   * Resolves driver user ID for COD operations based on user role permissions.
   * 
   * Phân tích và lấy ID tài xế cho các thao tác COD dựa trên quyền vai trò của người dùng.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param requestedDriverId - Requested target driver ID / ID tài xế đích yêu cầu.
   * @returns Resolved driver ID / ID tài xế đã phân tích.
   * @throws ForbiddenException if driver attempts to query another driver / ForbiddenException nếu tài xế cố tình truy vấn tài xế khác.
   * @throws BadRequestException if driverId is missing for admin / BadRequestException nếu admin thiếu driverId trong yêu cầu.
   */
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

  /**
   * Validates permissions of a user role to query or modify a specific driver's COD financial records.
   * Ensures warehouse staff can only manage drivers within the same hub.
   * 
   * Xác thực quyền hạn của người dùng để truy vấn hoặc sửa đổi hồ sơ tài chính COD của tài xế.
   * Đảm bảo nhân viên kho chỉ được quản lý tài xế thuộc cùng một hub.
   * 
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param driverId - Target Driver User ID / ID tài xế đích.
   * @throws ForbiddenException if permissions are mismatched / ForbiddenException nếu quyền hạn không phù hợp.
   */
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

  /**
   * Generates a unique secure settlement batch code.
   * 
   * Tạo mã lô quyết toán duy nhất và an toàn.
   * 
   * @param driverId - Driver User ID / ID người dùng của tài xế.
   * @returns Generated settlement batch code string / Chuỗi mã lô quyết toán được tạo.
   */
  private buildSettlementBatchCode(driverId: number) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `COD-${datePart}-D${driverId}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  /**
   * Gathers user IDs of recipients who should receive notification alerts when COD changes occur.
   * 
   * Thu thập ID người dùng của các bên nhận thông báo khi có các thay đổi về COD xảy ra.
   * 
   * @param driverId - Driver User ID / ID người dùng của tài xế.
   * @param customerId - Optional customer user ID / ID khách hàng tùy chọn.
   * @returns Array of user IDs / Mảng ID người dùng nhận thông báo.
   */
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

  /**
   * Helper that escapes string cell data for standard CSV format compliance.
   * 
   * Trình hỗ trợ bao bọc và escape dữ liệu ô văn bản cho phù hợp định dạng CSV tiêu chuẩn.
   * 
   * @param value - Cell string / Chuỗi văn bản của ô.
   * @returns Safe CSV cell string / Chuỗi văn bản ô CSV an toàn.
   */
  private escapeCsvCell(value: string) {
    if (!/[",\r\n]/.test(value)) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
