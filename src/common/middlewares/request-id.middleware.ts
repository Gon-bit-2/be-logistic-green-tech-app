import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'

export const REQUEST_ID_HEADER = 'x-request-id'

export type RequestWithId = Request & {
  id?: string
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incomingRequestId = req.header(REQUEST_ID_HEADER)
    const requestId = incomingRequestId?.trim() || randomUUID()

    req.id = requestId
    res.setHeader(REQUEST_ID_HEADER, requestId)
    next()
  }
}
