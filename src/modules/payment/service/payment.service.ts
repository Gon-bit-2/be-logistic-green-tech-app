import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import Stripe from 'stripe'
import envConfig from 'src/config/config'
import { PaymentRepository } from '../repository/payment.repo'
import { PrismaService } from 'src/database/prisma.service'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'
/**
 * Interface biểu diễn cấu trúc Event gửi qua Webhook từ Stripe
 * Sử dụng interface cục bộ để tránh lỗi TypeScript Namespace collision với SDK Stripe.
 */
interface StripeWebhookEvent {
  type: string
  data: {
    object: {
      id: string // PaymentIntent ID
      [key: string]: any
    }
  }
}

const REUSABLE_PAYMENT_INTENT_STATUSES = new Set<string>([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'requires_capture',
])

@Injectable()
export class PaymentService {
  private stripe: InstanceType<typeof Stripe>
  private readonly logger = new Logger(PaymentService.name)
  private readonly stripeZeroDecimalCurrencies = new Set(['vnd'])

  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly prisma: PrismaService,
  ) {
    // Khởi tạo Stripe client
    this.stripe = new Stripe(envConfig.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any, // Sử dụng version ổn định
      typescript: true,
    })
  }

  /**
   * Khởi tạo Stripe Payment Intent cho khách hàng (Khách hàng gõ thẻ thanh toán)
   */
  async createPaymentIntent(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    })

    if (!order) throw new NotFoundException(`Order #${orderId} không tồn tại.`)
    if (order.customerId !== userId) throw new BadRequestException('Bạn không sở hữu đơn hàng này.')
    if (order.payment?.method === 'COD') {
      throw new BadRequestException('Đơn hàng COD không hỗ trợ khởi tạo thanh toán trực tuyến.')
    }

    // Kiểm tra đã thanh toán chưa
    if (order.payment?.status === 'COMPLETED') {
      throw new BadRequestException('Đơn hàng này đã được thanh toán.')
    }

    const amountVnd = this.normalizeStripeAmount(order.shippingFee, 'vnd')
    const previousTransactionId =
      order.payment?.method === 'STRIPE' && order.payment.status === 'PENDING'
        ? order.payment.transactionId
        : null

    if (previousTransactionId) {
      const reusableIntent = await this.getReusablePaymentIntent(previousTransactionId)

      if (reusableIntent?.client_secret) {
        return {
          clientSecret: reusableIntent.client_secret,
          transactionId: reusableIntent.id,
          amount: amountVnd,
        }
      }
    }

    // Tạo PaymentIntent
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: amountVnd,
        currency: 'vnd',
        metadata: { orderId: order.id.toString() },
      },
      {
        idempotencyKey: this.buildPaymentIntentIdempotencyKey(order.id, previousTransactionId),
      },
    )

    // Lưu Payment intent ID vào database để đối soát webhook
    await this.paymentRepo.upsertPayment(
      order.id,
      {
        orderId: order.id,
        amount: amountVnd,
        method: 'STRIPE',
        status: 'PENDING',
        transactionId: paymentIntent.id,
      },
      {
        transactionId: paymentIntent.id,
        method: 'STRIPE',
        status: 'PENDING',
        amount: amountVnd,
        paidAt: null,
      },
    )

    return {
      clientSecret: paymentIntent.client_secret,
      transactionId: paymentIntent.id,
      amount: amountVnd,
    }
  }

  /**
   * Tài xế xác nhận đã nhận tiền mặt từ khách hàng khi giao hàng
   */
  async confirmCOD(orderId: number, driverId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    })

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng')
    if (order.payment?.method === 'STRIPE') {
      throw new BadRequestException('Đơn hàng thanh toán online không thể xác nhận COD.')
    }
    if (order.payment?.status === 'COMPLETED' || order.isCodCollected) {
      throw new BadRequestException('Đơn hàng đã được thanh toán trước đó')
    }

    const amount = this.normalizeStripeAmount(order.shippingFee, 'vnd')

    await this.prisma.$transaction(async (tx) => {
      const now = new Date()

      if (!order.payment) {
        await tx.payment.create({
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
        await tx.payment.update({
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

      const wallet = await tx.wallet.upsert({
        where: { userId: driverId },
        create: { userId: driverId },
        update: {},
      })

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'COD_COLLECTION',
          status: 'COMPLETED',
          referenceId: `ORDER_${order.id}`,
          description: `Thu hộ COD cho đơn hàng #${order.trackingCode || order.id}`,
        },
      })

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          codCollected: {
            increment: amount,
          },
        },
      })

      await tx.order.update({
        where: { id: order.id },
        data: {
          codAmount: amount,
          isCodCollected: true,
          codCollectedAt: now,
        },
      })
    })

    this.logger.log(`[PAYMENT] Tài xế #${driverId} xác nhận COD cho Order #${orderId}`)
    return { success: true, message: 'Đã xác nhận thu hộ tiền mặt (COD) thành công' }
  }

  /**
   * Xử lý Stripe Webhook từ xa gửi về
   * Cập nhật trạng thái tự động thành COMPLETED khi khách quẹt thẻ thành công
   */
  async handleStripeWebhook(signature: string, payload: Buffer) {
    let event: StripeWebhookEvent
    const secret = envConfig.STRIPE_WEBHOOK_SECRET

    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET chưa được cấu hình. Từ chối xử lý webhook để tránh giả mạo.')
      throw new ServiceUnavailableException('Webhook Stripe chưa sẵn sàng')
    }

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret) as unknown as StripeWebhookEvent
    } catch (err: unknown) {
      this.logger.error(`Webhook signature verification failed: ${(err as Error).message}`)
      throw new BadRequestException(`Webhook Error: ${(err as Error).message}`)
    }

    // Xử lý các loại Event
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        await this.paymentRepo.updateByTransactionId(paymentIntent.id, 'COMPLETED', new Date())
        this.logger.log(`✅ [PAYMENT WEBHOOK] Thanh toán thành công cho intent ID: ${paymentIntent.id}`)
        break
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = event.data.object
        await this.paymentRepo.updateByTransactionId(failedIntent.id, 'FAILED')
        this.logger.warn(`❌ [PAYMENT WEBHOOK] Thanh toán thất bại cho intent ID: ${failedIntent.id}`)
        break
      }

      default:
        // Các loại event khác bỏ qua
        break
    }

    return { received: true }
  }

  async getPaymentByOrderId(orderId: number, user?: AccessTokenPayload) {
    if (user?.roleName === roleName.CUSTOMER) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true },
      })

      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng')
      }

      if (order.customerId !== user.userId) {
        throw new ForbiddenException('Error.PermissionDenied.NotResourceOwner')
      }
    }

    return this.paymentRepo.findByOrderId(orderId)
  }

  private async getReusablePaymentIntent(transactionId: string) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(transactionId)

      if (REUSABLE_PAYMENT_INTENT_STATUSES.has(paymentIntent.status)) {
        return paymentIntent
      }
    } catch (error) {
      this.logger.warn(`[PAYMENT] Không thể lấy lại payment intent ${transactionId}: ${(error as Error).message}`)
    }

    return null
  }

  private buildPaymentIntentIdempotencyKey(orderId: number, previousTransactionId: string | null) {
    if (!previousTransactionId) {
      return `payment-intent-order-${orderId}`
    }

    return `payment-intent-order-${orderId}-retry-${previousTransactionId}`
  }

  private normalizeStripeAmount(amount: unknown, currency: string): number {
    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Số tiền thanh toán không hợp lệ.')
    }

    if (this.stripeZeroDecimalCurrencies.has(currency.toLowerCase())) {
      return Math.round(numericAmount)
    }

    return Math.round(numericAmount * 100)
  }
}
