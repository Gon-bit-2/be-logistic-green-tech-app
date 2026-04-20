import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodError } from 'zod'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
    let message: string = 'Internal server error'
    let errors: any = null

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      const response = exception.getResponse()

      let rawMessage = (response as any).message
      if (typeof response === 'string') {
        rawMessage = response
      }

      if (Array.isArray(rawMessage)) {
        message = rawMessage.map((item: any) => item?.message ?? String(item)).join(', ')
      } else if (typeof rawMessage === 'string') {
        message = rawMessage
      }

      const resObj = typeof response === 'object' && response !== null ? response : {}
      errors = (resObj as any).errors || (resObj as any).error || null
    } else if (exception instanceof ZodError) {
      httpStatus = HttpStatus.BAD_REQUEST
      message = (exception as any).errors.map((err) => err.message).join(', ')
      errors = (exception as any).errors
    } else if (exception instanceof Error) {
      message = exception.message
    }

    const responseBody = {
      statusCode: httpStatus,
      message,
      ...(errors && { errors }),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      timestamp: new Date().toISOString(),
    }

    if (httpStatus >= 500) {
      this.logger.error(
        `[${ctx.getRequest().method}] ${ctx.getRequest().url} - ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`[${ctx.getRequest().method}] ${ctx.getRequest().url} - ${message}`)
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
  }
}
