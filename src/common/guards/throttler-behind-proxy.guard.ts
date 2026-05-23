import { ThrottlerGuard } from '@nestjs/throttler'
import { Injectable } from '@nestjs/common'
import type { Request } from 'express'

/**
 * Throttler guard that handles IP tracking behind a reverse proxy (e.g., Nginx, Cloudflare).
 * Guard giới hạn tần suất yêu cầu (Throttler) hỗ trợ theo dõi IP phía sau reverse proxy.
 *
 * Extends the NestJS standard `ThrottlerGuard` to correctly identify client IPs
 * using request proxy headers like `X-Forwarded-For`.
 * Kế thừa `ThrottlerGuard` tiêu chuẩn của NestJS để xác định chính xác IP của client
 * bằng cách sử dụng các header proxy như `X-Forwarded-For`.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  /**
   * Resolves the original client IP to track rate limit consumption.
   * Phân giải IP ban đầu của client để theo dõi việc tiêu thụ giới hạn tần suất.
   *
   * @param {Request} req - The current HTTP request object.
   * @param {Request} req - Đối tượng HTTP request hiện tại.
   * @returns {Promise<string>} The resolved client IP address.
   * @returns {Promise<string>} Địa chỉ IP của client đã được phân giải.
   */
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(req.ips[0] ?? req.ip ?? '') // individualize IP extraction to meet your own needs
  }
}
