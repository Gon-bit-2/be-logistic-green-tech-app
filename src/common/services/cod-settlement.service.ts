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

/**
 * Service that handles Cash On Delivery (COD) collection and settlement for orders.
 * Service xử lý việc thu hộ và đối soát tiền mặt (COD) cho các đơn hàng.
 *
 * Manages order status updates, payment completion, driver wallet adjustments, and transaction ledger logging.
 * Quản lý cập nhật trạng thái đơn hàng, hoàn tất thanh toán, điều chỉnh ví tài xế và ghi nhật ký giao dịch.
 */
@Injectable()
export class CodSettlementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public method to collect COD for an order and log it to the driver's wallet.
   * Phương thức public để thu hộ COD cho đơn hàng và ghi nhận vào ví tài xế.
   *
   * Automatically initializes a database transaction if not already running in one.
   * Tự động khởi tạo một giao dịch cơ sở dữ liệu nếu chưa được chạy trong một giao dịch.
   *
   * @param {number} orderId - The target order ID.
   * @param {number} orderId - ID đơn hàng mục tiêu.
   * @param {number} driverId - The ID of the driver who collected the cash.
   * @param {number} driverId - ID của tài xế đã thu tiền mặt.
   * @param {CollectCodOptions} [options] - Additional parameters (amount, transaction client, description).
   * @param {CollectCodOptions} [options] - Các tham số bổ sung (số tiền, client giao dịch, mô tả).
   * @returns Resolved success status and message.
   * @returns Trạng thái thành công và thông điệp đã phân giải.
   */
  async collectCodForOrder(orderId: number, driverId: number, options: CollectCodOptions = {}) {
    if (options.tx) {
      await this.collectCodWithClient(options.tx, orderId, driverId, options)
    } else {
      await this.prisma.$transaction((tx) => this.collectCodWithClient(tx, orderId, driverId, options))
    }

    return { success: true, message: 'Đã xác nhận thu hộ tiền mặt (COD) thành công' }
  }

  /**
   * Private handler executing the COD collection transactional logic.
   * Trình xử lý private thực thi logic giao dịch thu hộ COD.
   *
   * Validates payment status/method, registers payment database record, increases driver
   * wallet balance, and inserts a wallet ledger transaction log.
   * Xác thực trạng thái/phương thức thanh toán, đăng ký bản ghi CSDL thanh toán, tăng số dư
   * ví tài xế và chèn một bản ghi nhật ký giao dịch ví.
   *
   * @param {CodSettlementClient} client - Prisma transaction client.
   * @param {CodSettlementClient} client - Client giao dịch Prisma.
   * @param {number} orderId - The order ID.
   * @param {number} orderId - ID đơn hàng.
   * @param {number} driverId - The driver ID.
   * @param {number} driverId - ID tài xế.
   * @param {CollectCodOptions} options - Additional collection options.
   * @param {CollectCodOptions} options - Các tùy chọn thu hộ bổ sung.
   * @throws {NotFoundException} If the order is not found.
   * @throws {NotFoundException} Nếu không tìm thấy đơn hàng.
   * @throws {BadRequestException} If online payment, redundant payment attempt, or invalid amount.
   * @throws {BadRequestException} Nếu là thanh toán online, thanh toán bị trùng lặp hoặc số tiền không hợp lệ.
   */
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

  /**
   * Utility method to validate and normalize VND amount, rounding to nearest integer.
   * Phương thức tiện ích để xác thực và chuẩn hóa số tiền VND, làm tròn đến số nguyên gần nhất.
   *
   * @param {unknown} amount - The raw amount input.
   * @param {unknown} amount - Đầu vào số tiền thô.
   * @returns {number} The normalized integer amount.
   * @returns {number} Số tiền nguyên đã được chuẩn hóa.
   * @throws {BadRequestException} If amount is negative, zero, or not a finite number.
   * @throws {BadRequestException} Nếu số tiền âm, bằng không hoặc không phải là số hữu hạn.
   */
  private normalizeVndAmount(amount: unknown): number {
    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Số tiền thanh toán không hợp lệ.')
    }

    return Math.round(numericAmount)
  }
}
