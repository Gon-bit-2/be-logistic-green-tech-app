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
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { CodSettlementService } from 'src/common/services/cod-settlement.service'

type StripePaymentIntentEvent = {
  type: string
  data: {
    object: {
      id: string
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

/**
 * Service managing payment gateway integrations (Stripe) and Cash-On-Delivery (COD) processing.
 * 
 * Dịch vụ quản lý tích hợp cổng thanh toán (Stripe) và xử lý thanh toán tiền mặt khi giao hàng (COD).
 */
@Injectable()
export class PaymentService {
  private stripe: InstanceType<typeof Stripe>
  private readonly logger = new Logger(PaymentService.name)
  private readonly stripeZeroDecimalCurrencies = new Set(['vnd'])

  /**
   * Initializes the PaymentService with a configured Stripe client.
   * 
   * Khởi tạo PaymentService với Stripe client đã cấu hình.
   * 
   * @param paymentRepo - Payment Repository / Repository quản lý thanh toán.
   * @param prisma - Prisma Database Service / Dịch vụ cơ sở dữ liệu Prisma.
   * @param codSettlementService - COD Settlement Service / Dịch vụ quyết toán COD.
   */
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly prisma: PrismaService,
    private readonly codSettlementService: CodSettlementService,
  ) {
    // Khởi tạo Stripe client — sử dụng apiVersion mặc định của SDK
    // (tránh hardcode version cũ + ép kiểu rộng bypass type safety)
    this.stripe = new Stripe(envConfig.STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }

  /**
   * Creates a new Stripe PaymentIntent for an order, or retrieves a reusable pending one.
   * Ensures idempotency and logs the pending transaction inside the database.
   * 
   * Tạo Stripe PaymentIntent mới cho đơn hàng, hoặc tái sử dụng một intent đang chờ xử lý.
   * Đảm bảo tính idempotent và lưu lại giao dịch đang chờ trong cơ sở dữ liệu.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param userId - ID of the active customer performing checkout / ID của khách hàng đang thực hiện checkout.
   * @returns Client secret, transaction ID, and final payment amount / Client secret, ID giao dịch và số tiền thanh toán cuối cùng.
   * @throws NotFoundException if the order does not exist / NotFoundException nếu đơn hàng không tồn tại.
   * @throws BadRequestException if permissions mismatch or order status is inappropriate / BadRequestException nếu sai quyền sở hữu hoặc trạng thái đơn hàng không hợp lệ.
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
      order.payment?.method === 'STRIPE' && order.payment.status === 'PENDING' ? order.payment.transactionId : null

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
   * Confirms a Cash-on-Delivery (COD) payment collection by a driver.
   * Integrates with COD Settlement service.
   * 
   * Xác nhận thu tiền mặt (COD) thành công bởi tài xế.
   * Tích hợp với dịch vụ Quyết toán COD.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param driverId - Driver User ID / ID người dùng của tài xế.
   * @returns Detailed COD collection response / Phản hồi chi tiết lượt thu COD.
   */
  async confirmCOD(orderId: number, driverId: number) {
    const result = await this.codSettlementService.collectCodForOrder(orderId, driverId)
    this.logger.log(`[PAYMENT] Tài xế #${driverId} xác nhận COD cho Order #${orderId}`)
    return result
  }

  /**
   * Processes a Stripe webhook callback. Verifies signatures and updates transaction states.
   * 
   * Xử lý webhook gọi lại từ Stripe. Xác minh chữ ký và cập nhật trạng thái giao dịch.
   * 
   * @param signature - Stripe HMAC signature string / Chuỗi chữ ký HMAC của Stripe.
   * @param payload - Raw request body buffer / Buffer request thô.
   * @returns Object confirming webhook receipt / Đối tượng xác nhận đã nhận webhook.
   * @throws ServiceUnavailableException if Stripe webhook secret is unconfigured / ServiceUnavailableException nếu cấu hình webhook secret bị thiếu.
   * @throws BadRequestException if signature verification fails / BadRequestException nếu xác minh chữ ký thất bại.
   */
  async handleStripeWebhook(signature: string, payload: Buffer) {
    let event: StripePaymentIntentEvent
    const secret = envConfig.STRIPE_WEBHOOK_SECRET

    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET chưa được cấu hình. Từ chối xử lý webhook để tránh giả mạo.')
      throw new ServiceUnavailableException('Webhook Stripe chưa sẵn sàng')
    }

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret) as unknown as StripePaymentIntentEvent
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

  /**
   * Finds payment record by its associated Order ID. Validates user ownership for customers.
   * 
   * Tìm bản ghi thanh toán theo ID đơn hàng liên kết. Xác thực quyền sở hữu đối với khách hàng.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @returns Found payment record / Bản ghi thanh toán được tìm thấy.
   * @throws NotFoundException if order or payment is missing / NotFoundException nếu không tìm thấy đơn hàng hoặc thanh toán.
   * @throws ForbiddenException if a customer tries to access another user's order / ForbiddenException nếu khách hàng cố tình truy cập đơn hàng của người khác.
   */
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

    const payment = await this.paymentRepo.findByOrderId(orderId)
    if (!payment) {
      throw new NotFoundException('Không tìm thấy thanh toán')
    }

    return payment
  }

  /**
   * Retrieves an existing pending Stripe PaymentIntent that can be safely reused.
   * 
   * Lấy một PaymentIntent Stripe đang chờ xử lý hiện có để có thể tái sử dụng một cách an toàn.
   * 
   * @param transactionId - Stripe transaction ID / ID giao dịch Stripe.
   * @returns Retrieved Stripe PaymentIntent or null / PaymentIntent Stripe tìm thấy hoặc null.
   */
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

  /**
   * Builds a secure idempotency key for creating Stripe PaymentIntents.
   * 
   * Xây dựng khóa idempotent an toàn cho việc tạo các Stripe PaymentIntent.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param previousTransactionId - Previous pending transaction ID / ID giao dịch đang chờ xử lý trước đó.
   * @returns Generated idempotency key string / Chuỗi khóa idempotent được tạo.
   */
  private buildPaymentIntentIdempotencyKey(orderId: number, previousTransactionId: string | null) {
    if (!previousTransactionId) {
      return `payment-intent-order-${orderId}`
    }

    return `payment-intent-order-${orderId}-retry-${previousTransactionId}`
  }

  /**
   * Normalizes standard currency amount to values appropriate for Stripe API (e.g. cents vs whole amounts).
   * 
   * Chuẩn hóa số tiền tệ tiêu chuẩn thành giá trị thích hợp cho Stripe API (ví dụ: cent vs số tiền nguyên).
   * 
   * @param amount - Raw payment amount / Số tiền thanh toán thô.
   * @param currency - Target currency string / Chuỗi đơn vị tiền tệ đích.
   * @returns Stripe-compatible normalized amount / Số tiền chuẩn hóa tương thích với Stripe.
   * @throws BadRequestException if amount is invalid / BadRequestException nếu số tiền không hợp lệ.
   */
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
