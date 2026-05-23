import { Injectable } from '@nestjs/common'
import { PaymentStatus, Prisma } from 'generated/prisma'
import { PrismaService } from 'src/database/prisma.service'

/**
 * Repository for managing database queries of Payments via Prisma.
 * 
 * Kho lưu trữ quản lý các truy vấn cơ sở dữ liệu của các giao dịch Thanh toán thông qua Prisma.
 */
@Injectable()
export class PaymentRepository {
  /**
   * Initializes the PaymentRepository.
   * 
   * Khởi tạo PaymentRepository.
   * 
   * @param prisma - Prisma Service instance / Instance của dịch vụ Prisma.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds payment record linked to a specific Order ID.
   * 
   * Tìm bản ghi thanh toán liên kết với một ID đơn hàng cụ thể.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @returns Found payment record or null / Bản ghi thanh toán tìm thấy hoặc null.
   */
  async findByOrderId(orderId: number) {
    return this.prisma.payment.findUnique({ where: { orderId } })
  }

  /**
   * Creates or updates a payment record.
   * 
   * Tạo mới hoặc cập nhật một bản ghi thanh toán.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param data - Creation data / Dữ liệu tạo mới.
   * @param updateData - Update data / Dữ liệu cập nhật.
   * @returns Upserted payment record / Bản ghi thanh toán được upsert.
   */
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

  /**
   * Updates payment record status by its unique transaction ID.
   * 
   * Cập nhật trạng thái bản ghi thanh toán theo ID giao dịch duy nhất của nó.
   * 
   * @param transactionId - Stripe transaction ID / ID giao dịch Stripe.
   * @param status - Payment status / Trạng thái thanh toán.
   * @param paidAt - Date of payment completion / Thời gian hoàn tất thanh toán.
   * @returns Updated payment record / Bản ghi thanh toán đã cập nhật.
   */
  async updateByTransactionId(transactionId: string, status: PaymentStatus, paidAt?: Date) {
    return this.prisma.payment.update({
      where: { transactionId },
      data: { status, paidAt },
    })
  }

  /**
   * Updates COD payment record details when cash is collected.
   * 
   * Cập nhật chi tiết bản ghi thanh toán COD khi thu tiền mặt thành công.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param driverId - ID of the driver performing COD collection / ID của tài xế thực hiện thu tiền COD.
   * @returns Updated payment record / Bản ghi thanh toán đã cập nhật.
   */
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
