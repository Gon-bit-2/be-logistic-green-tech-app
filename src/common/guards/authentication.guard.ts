import { CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiKeyGuard } from './api-key.guard'
import { PaymentApiKeyGuard } from './payment-api-key.guard'
import { AccessTokenGuard } from 'src/common/guards/access-token.guard'
import { AuthType, AuthTypeType, ConditionGuard } from 'src/common/constants/auth.constant'
import { AUTH_TYPE_KEY, AuthTypeDecoratorPayload } from 'src/common/decorators/auth.decorator'

/**
 * Master authentication guard that orchestrates multiple authentication guards.
 * Guard xác thực chính điều phối nhiều guard xác thực khác nhau.
 *
 * Dynamically resolves authentication guards (Bearer JWT, API Key, Payment API Key, or None)
 * based on the `@Auth()` decorator metadata applied at the handler or class level.
 * Supports logical AND/OR conditions between multiple guard strategies.
 * Tự động phân giải các guard xác thực (Bearer JWT, API Key, Payment API Key, hoặc None)
 * dựa trên metadata của decorator `@Auth()` được áp dụng ở cấp độ handler hoặc class.
 * Hỗ trợ các điều kiện logic AND/OR giữa nhiều chiến lược guard khác nhau.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly authTypeGuardMap: Record<AuthTypeType, CanActivate>
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokenGuard: AccessTokenGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly paymentApiKeyGuard: PaymentApiKeyGuard,
  ) {
    this.authTypeGuardMap = {
      [AuthType.Bearer]: this.accessTokenGuard,
      [AuthType.APIKey]: this.apiKeyGuard,
      [AuthType.PaymentAPIKey]: this.paymentApiKeyGuard,
      [AuthType.None]: { canActivate: () => true },
    }
  }

  /**
   * Main guard handler to determine if a request meets the configured authentication criteria.
   * Trình xử lý guard chính để quyết định xem request có đáp ứng các tiêu chuẩn xác thực được cấu hình hay không.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {Promise<boolean>} Resolves to true if authentication succeeds.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu xác thực thành công.
   */
  async canActivate(context: ExecutionContext) {
    const authTypeValue = this.getAuthTypeValue(context)
    const authTypes = Array.isArray(authTypeValue.authTypes) ? authTypeValue.authTypes : [authTypeValue.authTypes]
    const guards = authTypes.map((authType) => this.authTypeGuardMap[authType])
    return authTypeValue.options.condition === ConditionGuard.And
      ? this.handleAndCondition(guards, context)
      : this.handleOrCondition(guards, context)
  }

  /**
   * Retrieves the configured authentication types and options from metadata.
   * Lấy các kiểu và tùy chọn xác thực được cấu hình từ metadata.
   *
   * Defaults to Bearer authentication with an AND condition if no metadata is specified.
   * Mặc định là xác thực Bearer với điều kiện AND nếu không có metadata nào được chỉ định.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {AuthTypeDecoratorPayload} The resolved auth type settings.
   * @returns {AuthTypeDecoratorPayload} Cấu hình kiểu xác thực được phân giải.
   */
  private getAuthTypeValue(context: ExecutionContext) {
    const authTypeValue = this.reflector.getAllAndOverride<AuthTypeDecoratorPayload | undefined>(AUTH_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { authTypes: [AuthType.Bearer], options: { condition: ConditionGuard.And } }
    return authTypeValue
  }

  /**
   * Executes guards under an OR condition logic (at least one guard must succeed).
   * Thực thi các guard theo logic điều kiện OR (ít nhất một guard phải thành công).
   *
   * Iterates through guards, returning true immediately upon the first success.
   * If all guards fail, it rethrows the last encountered HttpException or an UnauthorizedException.
   * Duyệt qua các guard, trả về true ngay lập tức khi guard đầu tiên thành công.
   * Nếu tất cả các guard thất bại, nó sẽ throw lại HttpException cuối cùng gặp phải hoặc UnauthorizedException.
   *
   * @param {CanActivate[]} guards - The list of guard instances to evaluate.
   * @param {CanActivate[]} guards - Danh sách các thực thể guard cần đánh giá.
   * @param {ExecutionContext} context - The execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi.
   * @returns {Promise<boolean>} Resolves to true if at least one guard passes.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu ít nhất một guard vượt qua.
   * @throws {HttpException} If all guards fail.
   * @throws {HttpException} Nếu tất cả các guard thất bại.
   */
  private async handleOrCondition(guards: CanActivate[], context: ExecutionContext) {
    let lastError: unknown = null
    //duyệt qua các guard nếu 1 guard pass thì return true
    for (const instance of guards) {
      if (!instance) {
        continue
      }
      try {
        if (await instance.canActivate(context)) {
          return true
        }
      } catch (error) {
        lastError = error
      }
    }
    if (lastError instanceof HttpException) {
      throw lastError
    }
    throw new UnauthorizedException()
  }

  /**
   * Executes guards under an AND condition logic (all guards must succeed).
   * Thực thi các guard theo logic điều kiện AND (tất cả các guard phải thành công).
   *
   * Iterates through guards, ensuring every single guard returns true.
   * If any guard fails, throws UnauthorizedException or rethrows encountered HttpExceptions.
   * Duyệt qua các guard, đảm bảo mọi guard đơn lẻ đều trả về true.
   * Nếu bất kỳ guard nào thất bại, throw UnauthorizedException hoặc throw lại các HttpException gặp phải.
   *
   * @param {CanActivate[]} guards - The list of guard instances to evaluate.
   * @param {CanActivate[]} guards - Danh sách các thực thể guard cần đánh giá.
   * @param {ExecutionContext} context - The execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi.
   * @returns {Promise<boolean>} Resolves to true if all guards pass.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu tất cả các guard vượt qua.
   * @throws {UnauthorizedException | HttpException} If any guard fails.
   * @throws {UnauthorizedException | HttpException} Nếu có bất kỳ guard nào thất bại.
   */
  private async handleAndCondition(guards: CanActivate[], context: ExecutionContext) {
    //duyệt qua các guard nếu tất cả guard pass thì return true
    for (const instance of guards) {
      if (!instance) {
        throw new UnauthorizedException()
      }
      try {
        if (!(await instance.canActivate(context))) {
          throw new UnauthorizedException()
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error
        }
        throw new UnauthorizedException()
      }
    }
    return true
  }
}
