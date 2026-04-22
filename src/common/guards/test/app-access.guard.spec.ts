import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AppAccessGuard } from '../app-access.guard'

describe('AppAccessGuard', () => {
  let authenticationGuard: { canActivate: jest.Mock }
  let rolesGuard: { canActivate: jest.Mock }
  let resourceAccessGuard: { canActivate: jest.Mock }
  let guard: AppAccessGuard

  const context = {} as ExecutionContext

  beforeEach(() => {
    authenticationGuard = {
      canActivate: jest.fn(),
    }
    rolesGuard = {
      canActivate: jest.fn(),
    }
    resourceAccessGuard = {
      canActivate: jest.fn(),
    }

    guard = new AppAccessGuard(authenticationGuard as any, rolesGuard as any, resourceAccessGuard as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('runs authentication before role and resource checks', async () => {
    authenticationGuard.canActivate.mockResolvedValue(true)
    rolesGuard.canActivate.mockResolvedValue(true)
    resourceAccessGuard.canActivate.mockResolvedValue(true)

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(authenticationGuard.canActivate).toHaveBeenCalledWith(context)
    expect(rolesGuard.canActivate).toHaveBeenCalledWith(context)
    expect(resourceAccessGuard.canActivate).toHaveBeenCalledWith(context)
    expect(authenticationGuard.canActivate.mock.invocationCallOrder[0]).toBeLessThan(
      rolesGuard.canActivate.mock.invocationCallOrder[0],
    )
    expect(rolesGuard.canActivate.mock.invocationCallOrder[0]).toBeLessThan(
      resourceAccessGuard.canActivate.mock.invocationCallOrder[0],
    )
  })

  it('stops when authentication fails', async () => {
    authenticationGuard.canActivate.mockRejectedValue(new UnauthorizedException())

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(rolesGuard.canActivate).not.toHaveBeenCalled()
    expect(resourceAccessGuard.canActivate).not.toHaveBeenCalled()
  })

  it('stops when role validation fails', async () => {
    authenticationGuard.canActivate.mockResolvedValue(true)
    rolesGuard.canActivate.mockRejectedValue(new ForbiddenException('Error.PermissionDenied'))

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    expect(resourceAccessGuard.canActivate).not.toHaveBeenCalled()
  })
})
