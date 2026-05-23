import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { REQUEST_USER_KEY } from 'src/common/constants/auth.constant'
import { AccessTokenPayload } from '../types/jwt.type'

/**
 * Parameter decorator to extract the active authenticated user from the HTTP request object.
 * Decorator tham số để trích xuất người dùng đã xác thực đang hoạt động từ đối tượng HTTP request.
 *
 * @param {keyof AccessTokenPayload | undefined} field - Optional specific field of the user payload to retrieve.
 * @param {keyof AccessTokenPayload | undefined} field - Trường cụ thể tùy chọn của user payload cần lấy.
 * @param {ExecutionContext} ctx - The NestJS execution context.
 * @param {ExecutionContext} ctx - Bối cảnh thực thi của NestJS.
 * @returns {any} The entire user payload or the specified field value.
 * @returns {any} Toàn bộ user payload hoặc giá trị của trường cụ thể được chỉ định.
 */
export const ActiveUser = createParamDecorator((field: keyof AccessTokenPayload | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Partial<Record<typeof REQUEST_USER_KEY, AccessTokenPayload>>>()
  const user: AccessTokenPayload | undefined = request[REQUEST_USER_KEY]
  return field ? user?.[field] : user
})
