import { Injectable } from '@nestjs/common'
import { PaymentStatus, Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: number) {
    return this.prisma.payment.findUnique({ where: { orderId } })
  }

  async upsertPayment(
    orderId: number,
    data: Prisma.PaymentUncheckedCreateInput,
    updateData: Prisma.PaymentUncheckedUpdateInput,
  ) {
    return this.prisma.payment.upsert({
      where: { orderId },
      create: data,
      update: updateData,
    })
  }

  async updateByTransactionId(transactionId: string, status: PaymentStatus, paidAt?: Date) {
    return this.prisma.payment.update({
      where: { transactionId },
      data: { status, paidAt },
    })
  }

  async updateCodPayment(orderId: number, driverId: number) {
    return this.prisma.payment.update({
      where: { orderId },
      data: {
        status: 'COMPLETED',
        method: 'COD',
        paidAt: new Date(),
        updatedById: driverId,
      },
    })
  }
}
