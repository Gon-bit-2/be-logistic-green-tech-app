import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import Stripe from 'stripe'
import envConfig from 'src/config/config'
import { PaymentRepository } from '../repository/payment.repo'
import { PrismaService } from 'src/database/prisma.service'
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

@Injectable()
export class PaymentService {
  private stripe: InstanceType<typeof Stripe>
  private readonly logger = new Logger(PaymentService.name)

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

    // Kiểm tra đã thanh toán chưa
    if (order.payment?.status === 'COMPLETED') {
      throw new BadRequestException('Đơn hàng này đã được thanh toán.')
    }

    // Stripe tính theo đơn vị nhỏ nhất (VND ko có thập phân nên raw = amount)
    // Nếu là USD thì phải * 100
    const amountVnd = Number(order.shippingFee)

    // Tạo PaymentIntent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountVnd,
      currency: 'vnd',
      metadata: { orderId: order.id.toString() },
    })

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
    if (order.payment?.status === 'COMPLETED') {
      throw new BadRequestException('Đơn hàng đã được thanh toán trước đó')
    }

    // Upsert or Update COD Payment
    if (!order.payment) {
      await this.paymentRepo.upsertPayment(
        order.id,
        {
          orderId: order.id,
          amount: Number(order.shippingFee),
          method: 'COD',
          status: 'COMPLETED',
          paidAt: new Date(),
          createdById: driverId,
        },
        {},
      )
    } else {
      await this.paymentRepo.updateCodPayment(order.id, driverId)
    }

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
      this.logger.warn(
        'STRIPE_WEBHOOK_SECRET chưa được cấu hình. Bypass signature check (KHÔNG AN TOÀN TRONG PRODUCTION).',
      )
      event = JSON.parse(payload.toString())
    } else {
      try {
        event = this.stripe.webhooks.constructEvent(payload, signature, secret) as unknown as StripeWebhookEvent
      } catch (err: unknown) {
        this.logger.error(`Webhook signature verification failed: ${(err as Error).message}`)
        throw new BadRequestException(`Webhook Error: ${(err as Error).message}`)
      }
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

  async getPaymentByOrderId(orderId: number) {
    return this.paymentRepo.findByOrderId(orderId)
  }
}
