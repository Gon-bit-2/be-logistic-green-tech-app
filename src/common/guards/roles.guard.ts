/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUEST_USER_KEY } from '../decorators/custom-validator.decorator'
import roleName from '../constants/role.constant'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { AccessTokenPayload } from 'src/types/jwt.type'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles) {
      return true
    }
    const request = context.switchToHttp().getRequest()
    const user = request[REQUEST_USER_KEY] as AccessTokenPayload

    if (!user) {
      throw new ForbiddenException('Error.PermissionDenied')
    }

    // Admin quyền lực tối cao, chấp hết mọi kèo
    if (user.roleName === roleName.ADMIN) {
      return true
    }

    if (!requiredRoles.includes(user.roleName)) {
      throw new ForbiddenException('Error.PermissionDenied')
    }
    return true
  }
}
