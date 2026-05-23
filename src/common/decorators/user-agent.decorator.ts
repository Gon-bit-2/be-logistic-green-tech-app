/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/**
 * Parameter decorator to extract the User-Agent header from the HTTP request.
 * Decorator tham số để trích xuất header User-Agent từ HTTP request.
 *
 * @param {unknown} data - Custom data passed to the decorator (unused).
 * @param {unknown} data - Dữ liệu tùy chỉnh truyền vào decorator (không dùng).
 * @param {ExecutionContext} ctx - The NestJS execution context.
 * @param {ExecutionContext} ctx - Bối cảnh thực thi của NestJS.
 * @returns {string} The User-Agent header string.
 * @returns {string} Chuỗi header User-Agent.
 */
export const UserAgent = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest()
  return request.headers['user-agent']
})
