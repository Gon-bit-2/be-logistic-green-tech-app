import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { AuthenticationGuard } from './authentication.guard'
import { RolesGuard } from './roles.guard'
import { ResourceAccessGuard } from './resource-access.guard'

/**
 * Global application access guard.
 * Guard truy cập ứng dụng toàn cục.
 *
 * Combines and sequentializes three primary guards:
 * 1. AuthenticationGuard: Checks user credentials or API keys.
 * 2. RolesGuard: Checks role permissions based on target endpoint metadata.
 * 3. ResourceAccessGuard: Verifies granular resource ownership and boundaries.
 *
 * Kết hợp và thực thi tuần tự ba guard chính:
 * 1. AuthenticationGuard: Kiểm tra thông tin xác thực của người dùng hoặc khóa API.
 * 2. RolesGuard: Kiểm tra quyền hạn vai trò dựa trên metadata của endpoint mục tiêu.
 * 3. ResourceAccessGuard: Xác minh quyền sở hữu tài nguyên chi tiết và ranh giới truy cập.
 */
@Injectable()
export class AppAccessGuard implements CanActivate {
  constructor(
    private readonly authenticationGuard: AuthenticationGuard,
    private readonly rolesGuard: RolesGuard,
    private readonly resourceAccessGuard: ResourceAccessGuard,
  ) {}

  /**
   * Evaluates if the request can pass all three authentication, role-based, and resource-based checks.
   * Đánh giá xem request có thể vượt qua cả ba bước kiểm tra xác thực, vai trò và tài nguyên hay không.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {Promise<boolean>} Resolves to true if all three guards pass.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu cả ba guard đều vượt qua.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.authenticationGuard.canActivate(context))) {
      return false
    }

    if (!(await this.rolesGuard.canActivate(context))) {
      return false
    }

    return this.resourceAccessGuard.canActivate(context)
  }
}
