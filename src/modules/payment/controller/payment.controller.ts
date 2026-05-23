import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  BadRequestException,
  Param,
  ParseIntPipe,
  Get,
  type RawBodyRequest,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import type { Request } from 'express'
import { Throttle } from '@nestjs/throttler'
import { PaymentService } from '../service/payment.service'
import { Auth, isPublic } from 'src/common/decorators/auth.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { AuthType } from 'src/common/constants/auth.constant'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  ConfirmCODResDto,
  CreatePaymentIntentResDto,
  PaymentResponseDto,
  StripeWebhookResDto,
} from '../dto/payment.dto'

/**
 * Controller for managing online payments (Stripe) and Cash-On-Delivery (COD) confirmations.
 * 
 * Controller quản lý các giao dịch thanh toán trực tuyến (Stripe) và xác nhận thu tiền mặt (COD).
 */
@Controller('payments')
export class PaymentController {
  /**
   * Initializes the PaymentController.
   * 
   * Khởi tạo PaymentController.
   * 
   * @param paymentService - The Payment service instance / Instance của dịch vụ thanh toán.
   */
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Creates a Stripe PaymentIntent for a customer to pay online for an order.
   * Rate Limit: 3 requests / 60 seconds to prevent abuse.
   * Only accessible by Customer.
   * 
   * Tạo Stripe PaymentIntent để khách hàng thực hiện thanh toán trực tuyến cho đơn hàng.
   * Giới hạn tần suất: 3 yêu cầu / 60 giây để ngăn ngừa lạm dụng.
   * Chỉ có thể truy cập bởi Khách hàng.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param userId - ID of the active customer user / ID của khách hàng đang đăng nhập.
   * @returns PaymentIntent client secret details / Chi tiết thông tin client secret của PaymentIntent.
   */
  @Post('create-intent/:orderId')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Roles(roleName.CUSTOMER)
  @ZodSerializerDto(CreatePaymentIntentResDto)
  createIntent(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser('userId') userId: number) {
    return this.paymentService.createPaymentIntent(orderId, userId)
  }

  /**
   * Confirms a Cash-On-Delivery (COD) cash collection for an order.
   * Only accessible by Driver.
   * 
   * Xác nhận thu tiền mặt (COD) thành công cho đơn hàng.
   * Chỉ có thể truy cập bởi Tài xế.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param driverId - ID of the active driver user / ID của tài xế đang thực hiện.
   * @returns Confirmation detail status / Chi tiết trạng thái xác nhận.
   */
  @Post('cod-confirm/:orderId')
  @HttpCode(HttpStatus.OK)
  @Auth(AuthType.Bearer)
  @Roles(roleName.DRIVER)
  @ZodSerializerDto(ConfirmCODResDto)
  confirmCOD(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser('userId') driverId: number) {
    return this.paymentService.confirmCOD(orderId, driverId)
  }

  /**
   * Retrieves payment details and status for a specific order.
   * Accessible by Customer, Driver, Admin, and Warehouse Staff.
   * 
   * Lấy chi tiết thông tin và trạng thái thanh toán của một đơn hàng cụ thể.
   * Có thể truy cập bởi Khách hàng, Tài xế, Admin và Nhân viên kho.
   * 
   * @param orderId - Order ID / ID đơn hàng.
   * @param user - Decoded JWT payload of the active user / Payload JWT của người dùng đang đăng nhập.
   * @returns Detailed payment status information / Thông tin chi tiết trạng thái thanh toán.
   */
  @Get('order/:orderId')
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(PaymentResponseDto)
  getPaymentStatus(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser() user: AccessTokenPayload) {
    return this.paymentService.getPaymentByOrderId(orderId, user)
  }

  /**
   * Webhook endpoint that receives secure async callback events from Stripe.
   * Verifies authenticity using the Stripe-Signature header.
   * 
   * Endpoint Webhook nhận các sự kiện gọi lại bất đồng bộ an toàn từ Stripe.
   * Xác thực tính hợp lệ bằng tiêu đề Stripe-Signature.
   * 
   * @param signature - Stripe HMAC signature header / Tiêu đề chữ ký HMAC của Stripe.
   * @param req - Express request holding raw body buffer / Request Express chứa buffer body thô.
   * @param body - Fallback JSON payload / Payload JSON dự phòng.
   * @returns Success confirmation payload / Kết quả xác nhận xử lý thành công.
   * @throws BadRequestException if signature is missing / BadRequestException nếu thiếu chữ ký.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @isPublic() // Webhook được public nhưng bị protect bởi HMAC Signature từ Stripe
  @ZodSerializerDto(StripeWebhookResDto)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown, // Fallback cho unit test hoặc môi trường không attach rawBody
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header')
    }

    // Runtime chuẩn dùng req.rawBody từ NestFactory.create(..., { rawBody: true }).
    const payload = req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(body))

    return this.paymentService.handleStripeWebhook(signature, payload)
  }
}
