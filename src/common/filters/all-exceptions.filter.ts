import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodError } from 'zod'
import { RequestWithId } from 'src/common/middlewares/request-id.middleware'

type ExceptionResponseBody = {
  errorCode?: unknown
  message?: string | { message?: string }[]
  error?: unknown
  errors?: unknown
}

function looksLikeErrorCode(value: string) {
  return /^Error\.[A-Za-z]+(?:\.[A-Za-z]+)*$/.test(value.trim())
}

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

    const { errorCode, httpStatus, message, errors } = this.resolveException(exception)
    const request = ctx.getRequest<RequestWithId>()

    const responseBody = {
      statusCode: httpStatus,
      message,
      ...(errorCode ? { errorCode } : {}),
      ...(errors != null ? { errors } : {}),
      ...(request.id && { requestId: request.id }),
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
    const { errorCode, httpStatus, message, errors } = this.resolveException(exception)

    const responseBody = {
      statusCode: httpStatus,
      message,
      ...(errorCode ? { errorCode } : {}),
      ...(errors != null ? { errors } : {}),
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
    let errors: unknown = null
    let errorCode: string | null = null

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      const response = exception.getResponse()

      const responseObject: ExceptionResponseBody =
        typeof response === 'object' && response !== null ? (response as ExceptionResponseBody) : {}
      let rawMessage = responseObject.message
      if (typeof response === 'string') {
        rawMessage = response
      }

      if (Array.isArray(rawMessage)) {
        message = rawMessage.map((item) => item?.message ?? String(item)).join(', ')
      } else if (typeof rawMessage === 'string') {
        message = rawMessage
      }

      errors = responseObject.errors || responseObject.error || null
      if (typeof responseObject.errorCode === 'string') {
        errorCode = responseObject.errorCode
      } else if (looksLikeErrorCode(message)) {
        errorCode = message
      }
    } else if (exception instanceof ZodError) {
      httpStatus = HttpStatus.BAD_REQUEST
      message = exception.issues.map((err) => err.message).join(', ')
      errors = exception.issues
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message
    }

    return { errorCode, httpStatus, message, errors }
  }
}
