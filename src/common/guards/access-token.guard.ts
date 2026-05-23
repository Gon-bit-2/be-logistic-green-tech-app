/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common'
import { Request } from 'express'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { HTTPMethod } from '../constants/role.constant'
import { REQUEST_ROLE_PERMISSIONS, REQUEST_USER_KEY } from '../constants/auth.constant'
import { RolePermissionType } from 'src/modules/role/model/role.model'
import { keyBy } from 'lodash'
import { TokenService } from 'src/common/services/token.service'
import { PrismaService } from 'src/database/prisma.service'
import { AccessTokenPayload } from '../types/jwt.type'

type permission = RolePermissionType['permissions'][number]
type CachedRole = RolePermissionType & {
  permissions: {
    [key: string]: permission
  }
}
type AuthenticatedRequest = Request & {
  [REQUEST_USER_KEY]?: AccessTokenPayload
  [REQUEST_ROLE_PERMISSIONS]?: RolePermissionType
}

/**
 * Normalizes a route segment by ensuring it starts with a slash and stripping root/wildcard slashes.
 * Chuẩn hóa một phân đoạn route bằng cách đảm bảo nó bắt đầu bằng dấu gạch chéo và loại bỏ dấu gạch chéo gốc/kí tự đại diện.
 *
 * @param {string} [value] - The raw route segment to normalize.
 * @param {string} [value] - Phân đoạn route thô cần chuẩn hóa.
 * @returns {string} The normalized route segment.
 * @returns {string} Phân đoạn route đã chuẩn hóa.
 */
function normalizeRouteSegment(value?: string) {
  if (!value) {
    return ''
  }

  if (value === '/' || value === '/*') {
    return ''
  }

  return value.startsWith('/') ? value : `/${value}`
}

/**
 * Construct the full permission check path from an HTTP request's base URL and route path.
 * Xây dựng đường dẫn kiểm tra quyền đầy đủ từ URL cơ sở và đường dẫn route của một HTTP request.
 *
 * @param {object} request - The request object containing baseUrl and route path.
 * @param {object} request - Đối tượng request chứa baseUrl và đường dẫn route.
 * @returns {string} The combined and cleaned up permission path.
 * @returns {string} Đường dẫn quyền được kết hợp và làm sạch.
 */
export function getPermissionPath(request: { baseUrl?: string; route?: { path?: string | string[] } }) {
  const baseUrl = normalizeRouteSegment(request.baseUrl)
  const routePath = Array.isArray(request.route?.path) ? request.route?.path[0] : request.route?.path
  const normalizedRoutePath = normalizeRouteSegment(routePath)
  const joinedPath = `${baseUrl}${normalizedRoutePath}` || '/'

  return joinedPath.replace(/\/{2,}/g, '/')
}

/**
 * Guard that handles access token authentication and permission authorization.
 * Guard xử lý xác thực access token và ủy quyền (phân quyền).
 *
 * Decodes the Bearer token, checks user identity, and verifies if the user's role
 * has permission to access the requested HTTP path and method.
 * Giải mã Bearer token, kiểm tra danh tính người dùng và xác minh xem vai trò (role) của
 * người dùng có quyền truy cập vào đường dẫn HTTP và phương thức được yêu cầu hay không.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Main guard handler to determine if a request can proceed.
   * Trình xử lý guard chính để quyết định xem một request có được phép tiếp tục hay không.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {Promise<boolean>} Resolves to true if authentication and authorization succeed.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu xác thực và ủy quyền thành công.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    //extract and validate token
    const decodedAccessToken = await this.extractAndValidateToken(request)
    //check user permission
    await this.validateUserPermission(decodedAccessToken, request)
    return true
  }

  /**
   * Extracts and validates the JWT access token from the request header.
   * Trích xuất và xác thực JWT access token từ header của request.
   *
   * Saves the decoded payload into the request object for downstream controllers/guards.
   * Lưu payload đã giải mã vào đối tượng request cho các controller/guard phía sau.
   *
   * @param {AuthenticatedRequest} request - The current HTTP request.
   * @param {AuthenticatedRequest} request - HTTP request hiện tại.
   * @returns {Promise<AccessTokenPayload>} The verified access token payload.
   * @returns {Promise<AccessTokenPayload>} Payload access token đã được xác thực.
   * @throws {UnauthorizedException} If the token is invalid or expired.
   * @throws {UnauthorizedException} Nếu token không hợp lệ hoặc đã hết hạn.
   */
  private async extractAndValidateToken(request: AuthenticatedRequest): Promise<AccessTokenPayload> {
    const accessToken = this.extractTokenFromHeader(request)
    try {
      const decodedAccessToken = await this.tokenService.verifyAccessToken(accessToken)

      request[REQUEST_USER_KEY] = decodedAccessToken
      return decodedAccessToken
    } catch {
      throw new UnauthorizedException('Error.InvalidAccessToken')
    }
  }

  /**
   * Extracts the raw token string from the Authorization header.
   * Trích xuất chuỗi token thô từ header Authorization.
   *
   * Expects the format 'Bearer <token>'.
   * Kì vọng định dạng 'Bearer <token>'.
   *
   * @param {AuthenticatedRequest} request - The current HTTP request.
   * @param {AuthenticatedRequest} request - HTTP request hiện tại.
   * @returns {string} The raw token string.
   * @returns {string} Chuỗi token thô.
   * @throws {UnauthorizedException} If the Authorization header is missing.
   * @throws {UnauthorizedException} Nếu thiếu header Authorization.
   */
  private extractTokenFromHeader(request: AuthenticatedRequest): string {
    const accessToken = request.headers.authorization?.split(' ')[1]
    if (!accessToken) {
      throw new UnauthorizedException('Error.MissingAccessToken')
    }
    return accessToken
  }

  /**
   * Validates if the user's role has the required permission for the requested endpoint.
   * Xác thực xem vai trò của người dùng có quyền hạn bắt buộc đối với endpoint được yêu cầu hay không.
   *
   * Checks the cache first to minimize database queries. If not cached, fetches role permissions
   * from the database and caches them.
   * Kiểm tra cache trước để giảm thiểu các truy vấn cơ sở dữ liệu. Nếu chưa có trong cache, lấy quyền hạn
   * của vai trò từ cơ sở dữ liệu và lưu vào cache.
   *
   * @param {AccessTokenPayload} decodedAccessToken - The validated token payload.
   * @param {AccessTokenPayload} decodedAccessToken - Payload token đã xác thực.
   * @param {AuthenticatedRequest} request - The current HTTP request.
   * @param {AuthenticatedRequest} request - HTTP request hiện tại.
   * @throws {ForbiddenException} If the role is inactive, deleted, or lacks permission.
   * @throws {ForbiddenException} Nếu vai trò không hoạt động, bị xóa hoặc thiếu quyền hạn.
   */
  private async validateUserPermission(decodedAccessToken: AccessTokenPayload, request: AuthenticatedRequest) {
    const roleId = decodedAccessToken.roleId

    const path = getPermissionPath(request)
    const cacheKey = `roleId:${roleId}`
    const method = request.method as keyof typeof HTTPMethod
    //
    let cachedRole = await this.cacheManager.get<CachedRole>(cacheKey)

    if (!cachedRole) {
      const role = await this.prismaService.role
        .findUniqueOrThrow({
          where: {
            id: roleId,
            isActive: true,
            deletedAt: null,
          },
          include: {
            permissions: {
              where: {
                deletedAt: null,
              },
            },
          },
        })
        .catch(() => {
          throw new ForbiddenException('Error.Forbidden')
        })
      const permissionObject = keyBy(
        role.permissions,
        (permission) => `${permission.path}_${permission.method}`,
      ) as CachedRole['permissions']

      cachedRole = {
        ...role,
        permissions: permissionObject,
      }
      await this.cacheManager.set(cacheKey, cachedRole, 1000 * 60 * 60)
      request[REQUEST_ROLE_PERMISSIONS] = role
    }

    const canAccess = cachedRole?.permissions[`${path}_${method}`]
    if (!canAccess) {
      throw new ForbiddenException('Error.Forbidden')
    }
  }
}
