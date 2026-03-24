import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import envConfig from 'src/config/config'

@Injectable()
export class PaymentApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const paymentApiKey = request.get('Authorization')?.split(' ')[1]

    if (paymentApiKey !== envConfig.PAYMENT_API_KEY) {
      throw new UnauthorizedException()
    }

    return true
  }
}
