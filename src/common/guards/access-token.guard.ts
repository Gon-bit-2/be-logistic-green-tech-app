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

function normalizeRouteSegment(value?: string) {
  if (!value) {
    return ''
  }

  if (value === '/' || value === '/*') {
    return ''
  }

  return value.startsWith('/') ? value : `/${value}`
}

export function getPermissionPath(request: { baseUrl?: string; route?: { path?: string | string[] } }) {
  const baseUrl = normalizeRouteSegment(request.baseUrl)
  const routePath = Array.isArray(request.route?.path) ? request.route?.path[0] : request.route?.path
  const normalizedRoutePath = normalizeRouteSegment(routePath)
  const joinedPath = `${baseUrl}${normalizedRoutePath}` || '/'

  return joinedPath.replace(/\/{2,}/g, '/')
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()
    //extract and validate token
    const decodedAccessToken = await this.extractAndValidateToken(request)
    //check user permission
    await this.validateUserPermission(decodedAccessToken, request)
    return true
  }
  private async extractAndValidateToken(request: any): Promise<AccessTokenPayload> {
    const accessToken = this.extractTokenFromHeader(request)
    try {
      const decodedAccessToken = await this.tokenService.verifyAccessToken(accessToken)

      request[REQUEST_USER_KEY] = decodedAccessToken
      return decodedAccessToken
    } catch {
      throw new UnauthorizedException('Error.InvalidAccessToken')
    }
  }
  private extractTokenFromHeader(request: any): string {
    const accessToken = request.headers.authorization?.split(' ')[1]
    if (!accessToken) {
      throw new UnauthorizedException('Error.MissingAccessToken')
    }
    return accessToken
  }
  private async validateUserPermission(decodedAccessToken: AccessTokenPayload, request: any) {
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
