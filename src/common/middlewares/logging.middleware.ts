import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Response } from 'express'
import { RequestWithId } from './request-id.middleware'
import { PrismaService } from 'src/database/prisma.service'

/**
 * Middleware ghi log structured cho mỗi HTTP request.
 *
 * Bổ sung so với phiên bản cũ:
 * - Content-Length (body size) giúp phát hiện payload lớn bất thường
 * - User ID (nếu đã authenticate) giúp trace lỗi theo người dùng
 * - User-Agent summary giúp phân biệt nguồn request (web/mobile/bot)
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name)
  private readonly slowRequestMs = Number(process.env.SLOW_REQUEST_MS ?? 1_000)

  constructor(private readonly prisma: PrismaService) {}

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const startedAt = Date.now()

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt
      const requestId = req.id ?? 'unknown'

      // Lấy content-length từ response header (bytes đã gửi)
      const contentLength = res.get('content-length') ?? '-'

      // Lấy userId từ JWT payload (nếu đã qua authentication guard)
      const userId = (req as unknown as Record<string, unknown>)['user']
        ? (((req as unknown as Record<string, unknown>)['user'] as { userId?: number })?.userId ?? '-')
        : '-'

      // Rút gọn user-agent: chỉ lấy phần đầu (browser/app name)
      const rawUa = req.get('user-agent') ?? '-'
      const userAgent = rawUa.length > 60 ? rawUa.substring(0, 60) + '...' : rawUa

      const isSlow = Number.isFinite(this.slowRequestMs) && durationMs >= this.slowRequestMs
      const message = `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms | size=${contentLength} uid=${userId} slow=${isSlow ? 'yes' : 'no'} ua="${userAgent}"`

      if (res.statusCode >= 500) {
        this.logger.error(message)
      } else if (res.statusCode >= 400 || isSlow) {
        this.logger.warn(message)
      } else {
        this.logger.log(message)
      }

      if (isSlow) {
        void this.prisma.slowRequestLog
          .create({
            data: {
              contentLength: String(contentLength),
              durationMs,
              method: req.method,
              path: req.originalUrl,
              requestId,
              statusCode: res.statusCode,
              userAgent,
              userId: typeof userId === 'number' ? userId : null,
            },
          })
          .catch((error) => {
            this.logger.warn(`Failed to persist slow request log: ${error instanceof Error ? error.message : String(error)}`)
          })
      }
    })

    next()
  }
}
