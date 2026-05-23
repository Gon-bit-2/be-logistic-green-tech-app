import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import envConfig from 'src/config/config'

/**
 * Guard that validates requests using an API key secret.
 * Guard xác thực các yêu cầu sử dụng mã bí mật API key.
 *
 * Typically used for secure server-to-server communications or internal services.
 * Thường được sử dụng cho truyền thông an toàn giữa các máy chủ (server-to-server) hoặc các dịch vụ nội bộ.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  /**
   * Main guard handler to validate the API key from the Authorization header.
   * Trình xử lý guard chính để xác thực API key từ header Authorization.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {boolean} True if the API key matches.
   * @returns {boolean} True nếu API key trùng khớp.
   * @throws {UnauthorizedException} If the API key is missing or incorrect.
   * @throws {UnauthorizedException} Nếu thiếu API key hoặc API key không chính xác.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const apiKey = request.get('Authorization')?.split(' ')[1]

    if (apiKey !== envConfig.API_KEY_SECRET) {
      throw new UnauthorizedException()
    }

    return true
  }
}
