import { Test, TestingModule } from '@nestjs/testing'
import { GoogleService } from './google.service'
import { AuthRepository } from '../repository/auth.repository'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthService } from './auth.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { RoleRepository } from 'src/modules/role/repository/role.repo'

jest.mock('src/config/config', () => ({
  __esModule: true,
  default: {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:8386/auth/google/callback',
    GOOGLE_CLIENT_REDIRECT_URI: 'appecomerce://callback',
  },
}))

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?scope=test&state=123'),
        getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'test' } }),
        setCredentials: jest.fn(),
      })),
    },
    oauth2: jest.fn().mockReturnValue({
      userinfo: {
        get: jest.fn().mockResolvedValue({ data: { email: 'test@example.com', name: 'Test', picture: 'pic.jpg' } }),
      },
    }),
  },
}))

describe('GoogleService', () => {
  let service: GoogleService
  let authRepository: any
  let authService: any
  let cacheManager: any

  beforeEach(async () => {
    const authRepoMock = {
      findUniqueIncludeRole: jest.fn(),
      createUserIncludeRole: jest.fn(),
      createDevice: jest.fn().mockResolvedValue({ id: 10 }),
    }

    const authServiceMock = {
      generateTokens: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    }

    const roleRepoMock = {
      getClientRoleId: jest.fn().mockResolvedValue(2),
    }

    const cacheManagerMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleService,
        { provide: AuthRepository, useValue: authRepoMock },
        { provide: RoleRepository, useValue: roleRepoMock },
        { provide: HashingService, useValue: { hash: jest.fn().mockResolvedValue('hashed') } },
        { provide: AuthService, useValue: authServiceMock },
        { provide: CACHE_MANAGER, useValue: cacheManagerMock },
      ],
    }).compile()

    service = module.get<GoogleService>(GoogleService)
    authRepository = module.get<AuthRepository>(AuthRepository)
    authService = module.get<AuthService>(AuthService)
    cacheManager = module.get(CACHE_MANAGER)
  })

  it('should generate an authorization URL and cache the OAuth state', async () => {
    const result = await service.getAuthorizationUrl({ userAgent: 'test', ip: '127.0.0.1' })
    expect(result.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?scope=test&state=123')
    expect(cacheManager.set).toHaveBeenCalled()
  })

  it('should process callback and return a session token for an existing user', async () => {
    authRepository.findUniqueIncludeRole.mockResolvedValue({ id: 1, roleId: 2, role: { name: 'CUSTOMER' } })
    cacheManager.get.mockResolvedValue({ userAgent: 'Jest', ip: '127.0.0.1' })

    const result = await service.googleCallback({ state: 'state-token', code: 'mock_code' })

    expect(result.sessionToken).toBeDefined()
    expect(authService.generateTokens).toHaveBeenCalledWith({
      userId: 1,
      deviceId: 10,
      roleId: 2,
      roleName: 'CUSTOMER',
    })
    expect(cacheManager.del).toHaveBeenCalledWith('google_oauth:state:state-token')
    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringMatching(/^google_oauth:session:/),
      { accessToken: 'a', refreshToken: 'r' },
      60000,
    )
  })

  it('should create a new user if not exists', async () => {
    authRepository.findUniqueIncludeRole.mockResolvedValue(null)
    authRepository.createUserIncludeRole.mockResolvedValue({ id: 2, roleId: 2, role: { name: 'CUSTOMER' } })
    cacheManager.get.mockResolvedValue({ userAgent: 'Jest', ip: '127.0.0.1' })

    const result = await service.googleCallback({ state: 'state-token', code: 'mock_code' })

    expect(result.sessionToken).toBeDefined()
    expect(authRepository.createUserIncludeRole).toHaveBeenCalled()
  })

  it('should throw a readable error when google callback code is missing', async () => {
    await expect(service.googleCallback({ state: undefined as any, code: undefined as any })).rejects.toThrow(
      'Thiếu mã xác thực từ Google',
    )
  })

  it('should reject callback when OAuth state cannot be found', async () => {
    cacheManager.get.mockResolvedValue(null)

    await expect(service.googleCallback({ state: 'missing-state', code: 'mock_code' })).rejects.toThrow(
      'Google OAuth state không hợp lệ hoặc đã hết hạn',
    )
  })

  it('should redeem a cached Google session once', async () => {
    cacheManager.get.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' })

    const result = await service.redeemGoogleSession('7d4a08ca-283e-4bf7-bb93-9b19b593c396')

    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' })
    expect(cacheManager.del).toHaveBeenCalledWith('google_oauth:session:7d4a08ca-283e-4bf7-bb93-9b19b593c396')
  })
})
