import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: number) {
    return this.prisma.payment.findUnique({ where: { orderId } })
  }

  async upsertPayment(orderId: number, data: any, updateData: any) {
    return this.prisma.payment.upsert({
      where: { orderId },
      create: data,
      update: updateData,
    })
  }

  async updateByTransactionId(transactionId: string, status: string, paidAt?: Date) {
    return this.prisma.payment.update({
      where: { transactionId },
      data: { status: status as any, paidAt },
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
