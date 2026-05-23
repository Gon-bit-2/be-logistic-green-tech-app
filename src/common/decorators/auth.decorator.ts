import { SetMetadata } from '@nestjs/common'
import { AuthType, AuthTypeType, ConditionGuard, ConditionGuardType } from 'src/common/constants/auth.constant'

export const AUTH_TYPE_KEY = 'authType'

export type AuthTypeDecoratorPayload = {
  authTypes: AuthTypeType | AuthTypeType[]
  options: { condition: ConditionGuardType }
}
/**
 * Decorator to specify the authentication strategies required for a route or controller.
 * Decorator để chỉ định các chiến lược xác thực bắt buộc đối với một tuyến đường hoặc controller.
 *
 * Supports multiple AuthTypes (e.g. Bearer JWT, API Key) and can evaluate them using
 * AND/OR logic conditions.
 * Hỗ trợ nhiều AuthType (ví dụ: Bearer JWT, API Key) và có thể đánh giá chúng bằng cách sử dụng
 * các điều kiện logic AND/OR.
 *
 * @param {AuthTypeType | AuthTypeType[]} authTypes - One or more authentication types required.
 * @param {AuthTypeType | AuthTypeType[]} authTypes - Một hoặc nhiều kiểu xác thực bắt buộc.
 * @param {object} [options] - Additional guard settings.
 * @param {object} [options] - Cấu hình bổ sung cho guard.
 * @param {ConditionGuardType} [options.condition] - Logical condition (AND/OR) to combine guards.
 * @param {ConditionGuardType} [options.condition] - Điều kiện logic (AND/OR) để kết hợp các guard.
 */
export const Auth = (authTypes: AuthTypeType | AuthTypeType[], options?: { condition: ConditionGuardType }) => {
  return SetMetadata(AUTH_TYPE_KEY, { authTypes, options: options ?? { condition: ConditionGuard.And } })
}

/**
 * Decorator to mark a route as public, bypassing all authentication guards.
 * Decorator để đánh dấu một tuyến đường là công khai (public), bỏ qua tất cả các guard xác thực.
 *
 * Sets the authentication type to `AuthType.None`.
 * Thiết lập kiểu xác thực thành `AuthType.None`.
 */
export const isPublic = () => Auth(AuthType.None)
