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

/**
 * Helper function to check if a string matches the format of a standard application error code.
 * Hàm bổ trợ để kiểm tra xem một chuỗi có khớp với định dạng của mã lỗi ứng dụng tiêu chuẩn hay không.
 *
 * Example pattern: 'Error.PermissionDenied.NotResourceOwner'
 * Định dạng ví dụ: 'Error.PermissionDenied.NotResourceOwner'
 *
 * @param {string} value - The error string to check.
 * @param {string} value - Chuỗi lỗi cần kiểm tra.
 * @returns {boolean} True if matches error code pattern.
 * @returns {boolean} True nếu khớp với định dạng mã lỗi.
 */
function looksLikeErrorCode(value: string) {
  return /^Error\.[A-Za-z]+(?:\.[A-Za-z]+)*$/.test(value.trim())
}

/**
 * Global exceptions filter that catches all unhandled exceptions across the application.
 * Bộ lọc ngoại lệ toàn cục bắt tất cả các ngoại lệ chưa được xử lý trong toàn bộ ứng dụng.
 *
 * Seamlessly handles both HTTP and WebSocket request exceptions, formats the response body,
 * logs errors with appropriate severity (warn vs. error), and attaches request tracking IDs.
 * Xử lý liền mạch các ngoại lệ của cả yêu cầu HTTP và WebSocket, định dạng body phản hồi,
 * ghi log lỗi với mức độ nghiêm trọng thích hợp (warn so với error) và đính kèm ID theo dõi yêu cầu.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  /**
   * Main entry point to catch and handle all thrown exceptions.
   * Điểm truy cập chính để bắt và xử lý tất cả các ngoại lệ được throw.
   *
   * @param {unknown} exception - The thrown exception object.
   * @param {unknown} exception - Đối tượng ngoại lệ được throw.
   * @param {ArgumentsHost} host - Context host containing request/response objects.
   * @param {ArgumentsHost} host - Host ngữ cảnh chứa các đối tượng request/response.
   */
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

  /**
   * Private helper to format and emit exceptions back to Socket.IO clients.
   * Hàm bổ trợ private để định dạng và phát (emit) ngoại lệ ngược lại cho client Socket.IO.
   *
   * @param {unknown} exception - The WebSocket exception.
   * @param {unknown} exception - Ngoại lệ WebSocket.
   * @param {ArgumentsHost} host - Context host containing WebSocket connection.
   * @param {ArgumentsHost} host - Host ngữ cảnh chứa kết nối WebSocket.
   */
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

  /**
   * Resolves raw exceptions (HttpException, ZodError, or generic Error) into standardized response formats.
   * Phân giải các ngoại lệ thô (HttpException, ZodError, hoặc Error chung) thành định dạng phản hồi tiêu chuẩn hóa.
   *
   * Parses validation issues from Zod and maps error messages to application-level error codes where possible.
   * Phân tích các vấn đề kiểm chứng từ Zod và ánh xạ thông điệp lỗi thành các mã lỗi cấp ứng dụng nếu có thể.
   *
   * @param {unknown} exception - The raw exception.
   * @param {unknown} exception - Ngoại lệ thô.
   * @returns Resolved properties: errorCode, httpStatus, message, errors.
   * @returns Các thuộc tính đã phân giải: errorCode, httpStatus, message, errors.
   */
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
