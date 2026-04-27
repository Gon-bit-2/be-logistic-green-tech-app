import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthenticationGuard } from '../authentication.guard'
import { AuthType, ConditionGuard } from 'src/common/constants/auth.constant'

describe('AuthenticationGuard', () => {
  let reflector: jest.Mocked<Reflector>
  let accessTokenGuard: { canActivate: jest.Mock }
  let apiKeyGuard: { canActivate: jest.Mock }
  let paymentApiKeyGuard: { canActivate: jest.Mock }
  let guard: AuthenticationGuard

  const createContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>
    accessTokenGuard = {
      canActivate: jest.fn(),
    }
    apiKeyGuard = {
      canActivate: jest.fn(),
    }
    paymentApiKeyGuard = {
      canActivate: jest.fn(),
    }

    guard = new AuthenticationGuard(reflector, accessTokenGuard as any, apiKeyGuard as any, paymentApiKeyGuard as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('uses bearer auth by default when route has no metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)
    accessTokenGuard.canActivate.mockResolvedValue(true)

    await expect(guard.canActivate(createContext())).resolves.toBe(true)
    expect(accessTokenGuard.canActivate).toHaveBeenCalledTimes(1)
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
    expect(paymentApiKeyGuard.canActivate).not.toHaveBeenCalled()
  })

  it('bypasses auth for public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      authTypes: AuthType.None,
      options: { condition: ConditionGuard.And },
    })

    await expect(guard.canActivate(createContext())).resolves.toBe(true)
    expect(accessTokenGuard.canActivate).not.toHaveBeenCalled()
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
    expect(paymentApiKeyGuard.canActivate).not.toHaveBeenCalled()
  })

  it('dispatches generic api key routes to ApiKeyGuard', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      authTypes: AuthType.APIKey,
      options: { condition: ConditionGuard.And },
    })
    apiKeyGuard.canActivate.mockResolvedValue(true)

    await expect(guard.canActivate(createContext())).resolves.toBe(true)
    expect(apiKeyGuard.canActivate).toHaveBeenCalledTimes(1)
    expect(paymentApiKeyGuard.canActivate).not.toHaveBeenCalled()
    expect(accessTokenGuard.canActivate).not.toHaveBeenCalled()
  })

  it('dispatches payment api key routes to PaymentApiKeyGuard', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      authTypes: AuthType.PaymentAPIKey,
      options: { condition: ConditionGuard.And },
    })
    paymentApiKeyGuard.canActivate.mockResolvedValue(true)

    await expect(guard.canActivate(createContext())).resolves.toBe(true)
    expect(paymentApiKeyGuard.canActivate).toHaveBeenCalledTimes(1)
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
    expect(accessTokenGuard.canActivate).not.toHaveBeenCalled()
  })

  it('passes Or condition when one guard succeeds', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      authTypes: [AuthType.PaymentAPIKey, AuthType.Bearer],
      options: { condition: ConditionGuard.Or },
    })
    paymentApiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException())
    accessTokenGuard.canActivate.mockResolvedValue(true)

    await expect(guard.canActivate(createContext())).resolves.toBe(true)
    expect(paymentApiKeyGuard.canActivate).toHaveBeenCalledTimes(1)
    expect(accessTokenGuard.canActivate).toHaveBeenCalledTimes(1)
  })

  it('fails And condition when one guard fails', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      authTypes: [AuthType.PaymentAPIKey, AuthType.Bearer],
      options: { condition: ConditionGuard.And },
    })
    paymentApiKeyGuard.canActivate.mockResolvedValue(true)
    accessTokenGuard.canActivate.mockRejectedValue(new UnauthorizedException())

    await expect(guard.canActivate(createContext())).rejects.toThrow(UnauthorizedException)
  })
})
