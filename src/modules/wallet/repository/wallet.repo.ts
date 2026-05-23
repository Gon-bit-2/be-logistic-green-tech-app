import { Injectable } from '@nestjs/common'
import { PrismaService } from '@src/database/prisma.service'
import {
  CodSettlementBatchStatus,
  CodSettlementItemStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
} from 'generated/prisma'

export type OutstandingCodOrder = {
  amount: number
  collectedAt: Date
  orderId: number
  trackingCode: string
  transactionId: number
}

/**
 * Repository handling database operations for Driver Wallets, transactions, and COD financial settlement batches via Prisma.
 * 
 * Kho lưu trữ xử lý các hoạt động cơ sở dữ liệu cho Ví tài xế, giao dịch và các lô quyết toán tài chính COD thông qua Prisma.
 */
@Injectable()
export class WalletRepository {
  /**
   * Initializes the WalletRepository.
   * 
   * Khởi tạo WalletRepository.
   * 
   * @param prisma - Prisma Service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new wallet record in the database for a driver.
   * 
   * Tạo một bản ghi ví mới trong cơ sở dữ liệu cho tài xế.
   * 
   * @param userId - Driver User ID / ID người dùng của tài xế.
   * @returns Created wallet record / Bản ghi ví được tạo.
   */
  async createWallet(userId: number) {
    return this.prisma.wallet.create({
      data: {
        userId,
      },
    })
  }

  /**
   * Retrieves a driver's wallet. Automatically creates one if it does not exist.
   * 
   * Lấy ví điện tử của một tài xế. Tự động tạo mới nếu ví chưa tồn tại.
   * 
   * @param userId - Driver User ID / ID người dùng của tài xế.
   * @returns Driver wallet record / Bản ghi ví tài xế.
   */
  async getWalletByUserId(userId: number) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    })

    // Auto-create if not exists
    if (!wallet) {
      wallet = await this.createWallet(userId)
    }

    return wallet
  }

  /**
   * Adds collected COD cash to a driver's wallet and creates a transaction record in a secure transaction block.
   * 
   * Thêm tiền COD đã thu vào ví của tài xế và tạo bản ghi giao dịch trong một khối transaction an toàn.
   * 
   * @param userId - Driver User ID / ID người dùng của tài xế.
   * @param amount - Collected amount / Số tiền đã thu.
   * @param referenceId - Matching transaction reference / Mã tham chiếu giao dịch phù hợp.
   * @param description - Details description / Mô tả chi tiết.
   * @returns Updated driver wallet details / Chi tiết ví tài xế đã cập nhật.
   */
  async addCodToWallet(userId: number, amount: number, referenceId: string, description: string) {
    const wallet = await this.getWalletByUserId(userId)

    return this.prisma.$transaction(async (tx) => {
      // 1. Create transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'COD_COLLECTION',
          status: 'COMPLETED',
          referenceId,
          description,
        },
      })

      // 2. Update wallet balances
      return tx.wallet.update({
        where: { id: wallet.id },
        data: {
          codCollected: {
            increment: amount,
          },
        },
      })
    })
  }

  /**
   * Reconciles driver's collected cash. Decrements the outstanding COD balance in a secure transaction block.
   * 
   * Quyết toán và đối soát số tiền mặt thu được của tài xế. Giảm số dư COD đang tồn đọng trong một khối transaction an toàn.
   * 
   * @param userId - Driver User ID / ID người dùng của tài xế.
   * @param amount - Reconciled amount / Số tiền đối soát.
   * @param referenceId - Reference key / Khóa tham chiếu.
   * @param description - Description notes / Ghi chú mô tả.
   * @returns Updated driver wallet details / Chi tiết ví tài xế đã cập nhật.
   * @throws Error if the driver has insufficient COD balance to reconcile / Error nếu tài xế không đủ số dư COD tồn đọng để đối soát.
   */
  async reconcileCod(userId: number, amount: number, referenceId: string, description: string) {
    const wallet = await this.getWalletByUserId(userId)

    if (Number(wallet.codCollected) < amount) {
      throw new Error(
        `Không đủ lượng COD đang nợ để đối soát. Số dư: ${String(wallet.codCollected)}, yêu cầu: ${amount}`,
      )
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          type: TransactionType.COD_RECONCILIATION,
          status: TransactionStatus.COMPLETED,
          referenceId,
          description,
        },
      })

      return tx.wallet.update({
        where: { id: wallet.id },
        data: {
          codCollected: {
            decrement: amount,
          },
        },
      })
    })
  }

  /**
   * Finds outstanding COD orders for a specific driver that haven't been locked in active settlement batches.
   * 
   * Tìm kiếm các đơn hàng COD tồn đọng của tài xế cụ thể chưa bị khóa trong các đợt quyết toán đang hoạt động.
   * 
   * @param input - Driver ID and optional date range / ID tài xế và khoảng thời gian tùy chọn.
   * @returns List of outstanding COD orders / Danh sách các đơn hàng COD tồn đọng.
   */
  async findOutstandingCodOrders(input: { driverId: number; from?: Date; to?: Date }) {
    const createdAt: Prisma.DateTimeFilter = {}
    if (input.from) createdAt.gte = input.from
    if (input.to) createdAt.lte = input.to

    // COD_COLLECTION transaction là audit trail đáng tin nhất để biết tài xế nào đã thu tiền đơn nào.
    // Order.currentTripId thường bị clear khi DELIVERED, nên không dùng nó để suy ra tài xế thu COD.
    const collectionTransactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: Object.keys(createdAt).length ? createdAt : undefined,
        referenceId: { startsWith: 'ORDER_' },
        status: TransactionStatus.COMPLETED,
        type: TransactionType.COD_COLLECTION,
        wallet: { userId: input.driverId },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        amount: true,
        createdAt: true,
        id: true,
        referenceId: true,
      },
    })

    const transactionByOrderId = new Map<number, (typeof collectionTransactions)[number]>()
    for (const transaction of collectionTransactions) {
      const orderId = this.parseOrderReference(transaction.referenceId)
      if (orderId && !transactionByOrderId.has(orderId)) {
        transactionByOrderId.set(orderId, transaction)
      }
    }

    const orderIds = [...transactionByOrderId.keys()]
    if (!orderIds.length) return []

    const lockedItems = await this.prisma.codSettlementItem.findMany({
      where: {
        batch: { status: { not: CodSettlementBatchStatus.CANCELLED } },
        orderId: { in: orderIds },
        status: {
          in: [CodSettlementItemStatus.PENDING, CodSettlementItemStatus.COMPLETED, CodSettlementItemStatus.DISPUTED],
        },
      },
      select: { orderId: true },
    })
    const lockedOrderIds = new Set(lockedItems.map((item) => item.orderId))

    const orders = await this.prisma.order.findMany({
      where: {
        codReconciledAt: null,
        deletedAt: null,
        id: { in: orderIds.filter((orderId) => !lockedOrderIds.has(orderId)) },
        isCodCollected: true,
        payment: {
          is: {
            method: 'COD',
            status: 'COMPLETED',
          },
        },
      },
      select: {
        codAmount: true,
        id: true,
        payment: { select: { amount: true } },
        trackingCode: true,
      },
    })

    return orders
      .map<OutstandingCodOrder>((order) => {
        const transaction = transactionByOrderId.get(order.id)!
        return {
          amount: Number(order.payment?.amount ?? order.codAmount ?? transaction.amount),
          collectedAt: transaction.createdAt,
          orderId: order.id,
          trackingCode: order.trackingCode,
          transactionId: transaction.id,
        }
      })
      .sort((a, b) => a.collectedAt.getTime() - b.collectedAt.getTime())
  }

  /**
   * Creates a new COD settlement batch along with nested order list items.
   * 
   * Tạo lô quyết toán COD mới cùng với các mục danh sách đơn hàng lồng nhau.
   * 
   * @param input - Batch code, creator ID, driver ID, and order details / Mã lô, ID người tạo, ID tài xế và chi tiết đơn hàng.
   * @returns Created settlement batch with nested orders / Lô quyết toán được tạo kèm danh sách đơn hàng.
   */
  async createSettlementBatch(input: {
    batchCode: string
    createdById: number
    driverId: number
    note?: string
    orders: OutstandingCodOrder[]
  }) {
    const totalAmount = input.orders.reduce((sum, order) => sum + order.amount, 0)

    // Batch và items được tạo cùng transaction để không có batch rỗng nếu createMany item lỗi.
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.codSettlementBatch.create({
        data: {
          batchCode: input.batchCode,
          createdById: input.createdById,
          driverId: input.driverId,
          note: input.note,
          orderCount: input.orders.length,
          totalAmount,
        },
      })

      await tx.codSettlementItem.createMany({
        data: input.orders.map((order) => ({
          amount: order.amount,
          batchId: batch.id,
          orderId: order.orderId,
        })),
      })

      return tx.codSettlementBatch.findUnique({
        where: { id: batch.id },
        include: {
          driver: { select: { fullName: true, hubId: true, id: true } },
          items: {
            include: {
              order: {
                select: {
                  codAmount: true,
                  codCollectedAt: true,
                  codReconciledAt: true,
                  id: true,
                  payment: { select: { amount: true, method: true, status: true } },
                  trackingCode: true,
                },
              },
              transaction: { select: { id: true, referenceId: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      })
    })
  }

  /**
   * Retrieves a specific settlement batch by ID with deep nested entities.
   * 
   * Lấy một lô quyết toán cụ thể theo ID cùng các thực thể lồng sâu.
   * 
   * @param batchId - Settlement batch ID / ID lô quyết toán.
   * @returns Found settlement batch details / Chi tiết lô quyết toán được tìm thấy.
   */
  async findSettlementBatchById(batchId: number) {
    return this.prisma.codSettlementBatch.findUnique({
      where: { id: batchId },
      include: {
        driver: { select: { fullName: true, hubId: true, id: true } },
        items: {
          include: {
            order: {
              select: {
                codAmount: true,
                codCollectedAt: true,
                codReconciledAt: true,
                id: true,
                payment: { select: { amount: true, method: true, status: true } },
                trackingCode: true,
              },
            },
            transaction: { select: { id: true, referenceId: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })
  }

  /**
   * Lists COD settlement batches matching query filters.
   * 
   * Liệt kê danh sách các lô quyết toán COD khớp với các bộ lọc truy vấn.
   * 
   * @param input - Driver ID, page, limit, status, and optional dates / ID tài xế, trang, giới hạn, trạng thái và ngày tùy chọn.
   * @returns Paginated lists of batches and total count / Danh sách các lô quyết toán phân trang và tổng số lượng.
   */
  async listSettlementBatches(input: {
    driverId?: number
    from?: Date
    limit: number
    page: number
    status?: CodSettlementBatchStatus
    to?: Date
  }) {
    const where: Prisma.CodSettlementBatchWhereInput = {
      ...(input.driverId ? { driverId: input.driverId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    }

    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.codSettlementBatch.findMany({
        where,
        include: {
          driver: { select: { fullName: true, hubId: true, id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.codSettlementBatch.count({ where }),
    ])

    return { data, page: input.page, limit: input.limit, totalItems }
  }

  /**
   * Approves and completes a COD settlement batch. Deducts cash outstanding balance and registers internal transactions.
   * 
   * Phê duyệt và hoàn tất lô quyết toán COD. Khấu trừ số dư tiền mặt tồn đọng và đăng ký các giao dịch nội bộ.
   * 
   * @param input - Batch ID, completion admin user ID, and notes / ID lô, ID admin hoàn tất và ghi chú.
   * @returns Completed settlement batch details / Chi tiết lô quyết toán đã hoàn tất.
   * @throws Error if driver has insufficient wallet COD balance / Error nếu tài xế không đủ số dư COD trong ví.
   */
  async completeSettlementBatch(input: { batchId: number; completedById: number; note?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.codSettlementBatch.findUnique({
        where: { id: input.batchId },
        include: { items: true },
      })

      if (!batch) return null
      if (batch.status === CodSettlementBatchStatus.COMPLETED) return batch

      const wallet = await tx.wallet.findUnique({ where: { userId: batch.driverId } })
      if (!wallet) throw new Error('Không tìm thấy ví của tài xế.')

      const totalAmount = Number(batch.totalAmount)
      if (Number(wallet.codCollected) < totalAmount) {
        throw new Error(`Không đủ COD để đối soát. Số dư: ${String(wallet.codCollected)}, yêu cầu: ${totalAmount}`)
      }

      // Một transaction âm đại diện cho toàn batch, còn từng item giữ transactionId để truy vết.
      const reconciliationTransaction = await tx.transaction.create({
        data: {
          amount: -totalAmount,
          description: input.note ?? batch.note ?? `Đối soát COD batch ${batch.batchCode}`,
          referenceId: `COD_BATCH_${batch.id}`,
          status: TransactionStatus.COMPLETED,
          type: TransactionType.COD_RECONCILIATION,
          walletId: wallet.id,
        },
      })

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { codCollected: { decrement: totalAmount } },
      })

      await tx.codSettlementItem.updateMany({
        where: { batchId: batch.id, status: CodSettlementItemStatus.PENDING },
        data: {
          status: CodSettlementItemStatus.COMPLETED,
          transactionId: reconciliationTransaction.id,
        },
      })

      await tx.order.updateMany({
        where: {
          id: { in: batch.items.map((item) => item.orderId) },
          isCodCollected: true,
        },
        data: { codReconciledAt: new Date() },
      })

      return tx.codSettlementBatch.update({
        where: { id: batch.id },
        data: {
          completedAt: new Date(),
          completedById: input.completedById,
          note: input.note ?? batch.note,
          status: CodSettlementBatchStatus.COMPLETED,
        },
      })
    })
  }

  /**
   * Marks batch entries as disputed.
   * 
   * Đánh dấu các mục lô quyết toán là đang tranh chấp.
   * 
   * @param input - Batch ID, specific items list, and dispute reason / ID lô, danh sách các mục cụ thể và lý do tranh chấp.
   * @returns Disputed settlement batch details / Chi tiết lô quyết toán đang tranh chấp.
   */
  async disputeSettlementBatch(input: { batchId: number; itemIds?: number[]; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.codSettlementBatch.findUnique({ where: { id: input.batchId }, include: { items: true } })
      if (!batch) return null

      const itemIds = input.itemIds?.length ? input.itemIds : batch.items.map((item) => item.id)
      await tx.codSettlementItem.updateMany({
        where: { batchId: batch.id, id: { in: itemIds } },
        data: {
          disputeReason: input.reason,
          status: CodSettlementItemStatus.DISPUTED,
        },
      })

      return tx.codSettlementBatch.update({
        where: { id: batch.id },
        data: {
          disputedAt: new Date(),
          status: CodSettlementBatchStatus.DISPUTED,
        },
      })
    })
  }

  /**
   * Helper that parses Order ID from a standard transaction reference code string.
   * 
   * Trình hỗ trợ phân tích Order ID từ chuỗi mã tham chiếu giao dịch tiêu chuẩn.
   * 
   * @param referenceId - Reference key string / Chuỗi khóa tham chiếu.
   * @returns Order ID number or null / Số ID đơn hàng hoặc null.
   */
  private parseOrderReference(referenceId: string | null) {
    const match = /^ORDER_(\d+)$/i.exec(referenceId?.trim() ?? '')
    return match ? Number(match[1]) : null
  }
}
