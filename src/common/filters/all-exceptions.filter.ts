import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodError } from 'zod'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'ws') {
      this.handleWsException(exception, host)
      return
    }

    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()

    const { httpStatus, message, errors } = this.resolveException(exception)
    const request = ctx.getRequest()

    const responseBody = {
      statusCode: httpStatus,
      message,
      ...(errors && { errors }),
      path: httpAdapter.getRequestUrl(request),
      timestamp: new Date().toISOString(),
    }

    if (httpStatus >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - ${message}`)
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
  }

  private handleWsException(exception: unknown, host: ArgumentsHost) {
    const ws = host.switchToWs()
    const client = ws.getClient<{ emit?: (event: string, payload: unknown) => void; id?: string }>()
    const { httpStatus, message, errors } = this.resolveException(exception)

    const responseBody = {
      statusCode: httpStatus,
      message,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    }

    if (httpStatus >= 500) {
      this.logger.error(
        `[WS] ${client?.id ?? 'unknown'} - ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`[WS] ${client?.id ?? 'unknown'} - ${message}`)
    }

    client?.emit?.('exception', responseBody)
  }

  private resolveException(exception: unknown) {
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
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

    return { httpStatus, message, errors }
  }
}
