import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AccessTokenGuard, getPermissionPath } from '../access-token.guard'

describe('getPermissionPath', () => {
  it('builds the full permission path for controller root routes', () => {
    expect(
      getPermissionPath({
        baseUrl: '/trips',
        route: { path: '/' },
      }),
    ).toBe('/trips')
  })

  it('builds the full permission path for nested routes', () => {
    expect(
      getPermissionPath({
        baseUrl: '/trips',
        route: { path: '/:id/status' },
      }),
    ).toBe('/trips/:id/status')
  })
})

describe('AccessTokenGuard', () => {
  let tokenService: { verifyAccessToken: jest.Mock }
  let prismaService: { role: { findUniqueOrThrow: jest.Mock } }
  let cacheManager: { get: jest.Mock; set: jest.Mock }
  let guard: AccessTokenGuard

  beforeEach(() => {
    tokenService = {
      verifyAccessToken: jest.fn(),
    }
    prismaService = {
      role: {
        findUniqueOrThrow: jest.fn(),
      },
    }
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    }

    guard = new AccessTokenGuard(tokenService as any, prismaService as any, cacheManager as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('allows access when the role has permission for the full trips path', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      roleId: 4,
      roleName: 'WAREHOUSE_STAFF',
      userId: 7,
    })
    cacheManager.get.mockResolvedValue(undefined)
    prismaService.role.findUniqueOrThrow.mockResolvedValue({
      id: 4,
      permissions: [
        {
          path: '/trips',
          method: 'GET',
        },
      ],
    })

    const request = {
      baseUrl: '/trips',
      headers: {
        authorization: 'Bearer valid-token',
      },
      method: 'GET',
      route: {
        path: '/',
      },
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }

    await expect(guard.canActivate(context as any)).resolves.toBe(true)
    expect(prismaService.role.findUniqueOrThrow).toHaveBeenCalled()
  })

  it('rejects access when no permission matches the full route path', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      roleId: 4,
      roleName: 'WAREHOUSE_STAFF',
      userId: 7,
    })
    cacheManager.get.mockResolvedValue(undefined)
    prismaService.role.findUniqueOrThrow.mockResolvedValue({
      id: 4,
      permissions: [
        {
          path: '/orders',
          method: 'GET',
        },
      ],
    })

    const request = {
      baseUrl: '/trips',
      headers: {
        authorization: 'Bearer valid-token',
      },
      method: 'GET',
      route: {
        path: '/',
      },
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }

    await expect(guard.canActivate(context as any)).rejects.toThrow(ForbiddenException)
  })

  it('rejects missing bearer tokens', async () => {
    const request = {
      headers: {},
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }

    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException)
  })
})
