import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { REQUEST_USER_KEY } from 'src/common/constants/auth.constant'
import { AccessTokenPayload } from '../types/jwt.type'

export const ActiveUser = createParamDecorator((field: keyof AccessTokenPayload | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Partial<Record<typeof REQUEST_USER_KEY, AccessTokenPayload>>>()
  const user: AccessTokenPayload | undefined = request[REQUEST_USER_KEY]
  return field ? user?.[field] : user
})
