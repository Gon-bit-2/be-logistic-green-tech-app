import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Response } from 'express'
import { RequestWithId } from './request-id.middleware'

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name)

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const startedAt = Date.now()

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt
      const requestId = req.id ?? 'unknown'
      const message = `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`

      if (res.statusCode >= 500) {
        this.logger.error(message)
      } else if (res.statusCode >= 400) {
        this.logger.warn(message)
      } else {
        this.logger.log(message)
      }
    })

    next()
  }
}
