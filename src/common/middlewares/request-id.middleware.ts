import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'

export const REQUEST_ID_HEADER = 'x-request-id'

export type RequestWithId = Request & {
  id?: string
}

/**
 * Middleware that assigns a unique Request ID to each incoming HTTP request.
 * Middleware gán một ID duy nhất cho mỗi yêu cầu HTTP gửi đến.
 *
 * Uses the client-provided `x-request-id` header if present, otherwise generates
 * a new random UUID. Attaches this ID to the request object and sets the response header
 * to facilitate end-to-end request tracing and debugging.
 * Sử dụng header `x-request-id` do client cung cấp nếu có, ngược lại sẽ tự tạo một UUID
 * ngẫu nhiên mới. Đính kèm ID này vào đối tượng request và thiết lập header phản hồi
 * nhằm tạo điều kiện cho việc theo dõi yêu cầu đầu-cuối (end-to-end trace) và gỡ lỗi.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  /**
   * Generates or extracts the request ID, sets it on the request and response objects, and passes control.
   * Tạo hoặc trích xuất ID yêu cầu, thiết lập nó trên các đối tượng request và response, sau đó chuyển giao kiểm soát.
   *
   * @param {RequestWithId} req - The incoming Express request.
   * @param {RequestWithId} req - Yêu cầu Express gửi đến.
   * @param {Response} res - The outgoing Express response.
   * @param {Response} res - Phản hồi Express gửi đi.
   * @param {NextFunction} next - The next middleware function.
   * @param {NextFunction} next - Hàm xử lý middleware tiếp theo.
   */
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incomingRequestId = req.header(REQUEST_ID_HEADER)
    const requestId = incomingRequestId?.trim() || randomUUID()

    req.id = requestId
    res.setHeader(REQUEST_ID_HEADER, requestId)
    next()
  }
}
