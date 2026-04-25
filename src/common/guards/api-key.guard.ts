import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import envConfig from 'src/config/config'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const apiKey = request.get('Authorization')?.split(' ')[1]

    if (apiKey !== envConfig.API_KEY_SECRET) {
      throw new UnauthorizedException()
    }

    return true
  }
}
