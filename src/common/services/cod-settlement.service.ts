import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'

type CodSettlementClient = Prisma.TransactionClient

type CollectCodOptions = {
  amount?: number
  description?: string
  orderReference?: string
  now?: Date
  tx?: CodSettlementClient
}

@Injectable()
export class CodSettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async collectCodForOrder(orderId: number, driverId: number, options: CollectCodOptions = {}) {
    if (options.tx) {
      await this.collectCodWithClient(options.tx, orderId, driverId, options)
    } else {
      await this.prisma.$transaction((tx) => this.collectCodWithClient(tx, orderId, driverId, options))
    }

    return { success: true, message: 'Đã xác nhận thu hộ tiền mặt (COD) thành công' }
  }

  private async collectCodWithClient(
    client: CodSettlementClient,
    orderId: number,
    driverId: number,
    options: CollectCodOptions,
  ) {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    })

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng')
    }

    if (order.payment?.method === 'STRIPE') {
      throw new BadRequestException('Đơn hàng thanh toán online không thể xác nhận COD.')
    }

    if (order.payment?.status === 'COMPLETED' || order.isCodCollected) {
      throw new BadRequestException('Đơn hàng đã được thanh toán trước đó')
    }

    const amount = this.normalizeVndAmount(options.amount ?? order.shippingFee)
    const now = options.now ?? new Date()
    const orderReference = options.orderReference ?? order.trackingCode ?? String(order.id)
    const description = options.description ?? `Thu hộ COD cho đơn hàng #${orderReference}`

    const orderUpdate = await client.order.updateMany({
      where: {
        id: order.id,
        isCodCollected: false,
      },
      data: {
        codAmount: amount,
        isCodCollected: true,
        codCollectedAt: now,
      },
    })

    if (orderUpdate.count === 0) {
      throw new BadRequestException('Đơn hàng đã được thanh toán trước đó')
    }

    if (!order.payment) {
      await client.payment.create({
        data: {
          orderId: order.id,
          amount,
          method: 'COD',
          status: 'COMPLETED',
          paidAt: now,
          createdById: driverId,
          updatedById: driverId,
        },
      })
    } else {
      await client.payment.update({
        where: { orderId: order.id },
        data: {
          amount,
          method: 'COD',
          status: 'COMPLETED',
          paidAt: now,
          updatedById: driverId,
        },
      })
    }

    const wallet = await client.wallet.upsert({
      where: { userId: driverId },
      create: { userId: driverId },
      update: {},
    })

    await client.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'COD_COLLECTION',
        status: 'COMPLETED',
        referenceId: `ORDER_${order.id}`,
        description,
      },
    })

    await client.wallet.update({
      where: { id: wallet.id },
      data: {
        codCollected: {
          increment: amount,
        },
      },
    })
  }

  private normalizeVndAmount(amount: unknown): number {
    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Số tiền thanh toán không hợp lệ.')
    }

    return Math.round(numericAmount)
  }
}
