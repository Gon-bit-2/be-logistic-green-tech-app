import { ThrottlerGuard } from '@nestjs/throttler'
import { Injectable } from '@nestjs/common'
import type { Request } from 'express'

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(req.ips[0] ?? req.ip ?? '') // individualize IP extraction to meet your own needs
  }
}
