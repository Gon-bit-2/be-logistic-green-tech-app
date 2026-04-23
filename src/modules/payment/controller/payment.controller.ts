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

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Tạo PaymentIntent (Khách hàng bấm thanh toán qua mạng).
   * Rate limit: 3 request / 60 giây — ngăn spam tạo PaymentIntent
   * (mỗi intent tạo trên Stripe đều tốn resource, không nên bypass throttle).
   */
  @Post('create-intent/:orderId')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Roles(roleName.CUSTOMER)
  createIntent(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser('userId') userId: number) {
    return this.paymentService.createPaymentIntent(orderId, userId)
  }

  /**
   * Xác nhận thu tiền mặt (Tài xế bấm sau khi thu COD)
   */
  @Post('cod-confirm/:orderId')
  @Auth(AuthType.Bearer)
  @Roles(roleName.DRIVER)
  confirmCOD(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser('userId') driverId: number) {
    return this.paymentService.confirmCOD(orderId, driverId)
  }

  /**
   * Xem trạng thái thanh toán
   */
  @Get('order/:orderId')
  @Roles(roleName.CUSTOMER, roleName.DRIVER, roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  getPaymentStatus(@Param('orderId', ParseIntPipe) orderId: number, @ActiveUser() user: AccessTokenPayload) {
    return this.paymentService.getPaymentByOrderId(orderId, user)
  }

  /**
   * Webhook: Nhận callback từ Stripe khi thanh toán thành công
   * Chú ý: Cần raw body buffer để verify signature. NestJS body-parser thường map JSON object.
   * Để nhận RawBody trong Nest, ta cần dùng (req: any) có req.rawBody hoặc Buffer xử lý qua Middleware.
   */
  @Post('webhook')
  @isPublic() // Webhook được public nhưng bị protect bởi HMAC Signature từ Stripe
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any, // Fallback cho unit test hoặc môi trường không attach rawBody
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header')
    }

    // Runtime chuẩn dùng req.rawBody từ NestFactory.create(..., { rawBody: true }).
    const payload = req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(body))

    return this.paymentService.handleStripeWebhook(signature, payload)
  }
}
