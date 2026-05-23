import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import envConfig from 'src/config/config'

/**
 * Guard that validates payment-specific API keys.
 * Guard xác thực API key phục vụ riêng cho các cổng thanh toán/giao dịch.
 *
 * Typically used to secure webhook endpoints or payment callback processing endpoints.
 * Thường được sử dụng để bảo mật các webhook endpoint hoặc các endpoint xử lý callback thanh toán.
 */
@Injectable()
export class PaymentApiKeyGuard implements CanActivate {
  /**
   * Main guard handler to validate the payment API key from the Authorization header.
   * Trình xử lý guard chính để xác thực payment API key từ header Authorization.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {boolean} True if the payment API key matches.
   * @returns {boolean} True nếu payment API key trùng khớp.
   * @throws {UnauthorizedException} If the payment API key is missing or incorrect.
   * @throws {UnauthorizedException} Nếu thiếu payment API key hoặc không chính xác.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const paymentApiKey = request.get('Authorization')?.split(' ')[1]

    if (paymentApiKey !== envConfig.PAYMENT_API_KEY) {
      throw new UnauthorizedException()
    }

    return true
  }
}
