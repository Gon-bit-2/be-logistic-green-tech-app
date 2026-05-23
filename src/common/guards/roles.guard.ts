/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUEST_USER_KEY } from '../constants/auth.constant'
import roleName from '../constants/role.constant'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { AccessTokenPayload } from '../types/jwt.type'

/**
 * Guard that restricts endpoint access based on user roles.
 * Guard giới hạn quyền truy cập endpoint dựa trên vai trò (role) của người dùng.
 *
 * Compares the user's roleName against the list of authorized roles specified
 * via the `@Roles()` decorator. Admins are automatically bypassed and allowed access.
 * So sánh roleName của người dùng với danh sách các vai trò được phép chỉ định qua
 * decorator `@Roles()`. Người quản trị (Admin) sẽ tự động được bỏ qua và cho phép truy cập.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Evaluates the role requirement for the current request context.
   * Đánh giá yêu cầu về vai trò (role) đối với bối cảnh request hiện tại.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {boolean} True if the user has one of the required roles or is an Admin.
   * @returns {boolean} True nếu người dùng có một trong các vai trò được yêu cầu hoặc là Admin.
   * @throws {ForbiddenException} If the user is unauthenticated or lacks the required role.
   * @throws {ForbiddenException} Nếu người dùng chưa xác thực hoặc thiếu vai trò được yêu cầu.
   */
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
