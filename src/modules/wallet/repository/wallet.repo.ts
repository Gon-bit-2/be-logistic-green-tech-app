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

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWallet(userId: number) {
    return this.prisma.wallet.create({
      data: {
        userId,
      },
    })
  }

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

  private parseOrderReference(referenceId: string | null) {
    const match = /^ORDER_(\d+)$/i.exec(referenceId?.trim() ?? '')
    return match ? Number(match[1]) : null
  }
}
