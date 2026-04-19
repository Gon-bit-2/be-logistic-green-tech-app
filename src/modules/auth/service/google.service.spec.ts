import { Test, TestingModule } from '@nestjs/testing';
import { GoogleService } from './google.service';
import { AuthRepository } from '../repository/auth.repository';
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo';
import { HashingService } from 'src/common/services/hashing.service';
import { TokenService } from 'src/common/services/token.service';
import { AuthService } from './auth.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?scope=test&state=123'),
        getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'test' } }),
        setCredentials: jest.fn(),
      }))
    },
    oauth2: jest.fn().mockReturnValue({
      userinfo: {
        get: jest.fn().mockResolvedValue({ data: { email: 'test@example.com', name: 'Test', picture: 'pic.jpg' } })
      }
    })
  }
}));

describe('GoogleService', () => {
  let service: GoogleService;
  let authRepository: any;
  let authService: any;

  beforeEach(async () => {
    const authRepoMock = {
      findUniqueIncludeRole: jest.fn(),
      createUserIncludeRole: jest.fn(),
      createDevice: jest.fn().mockResolvedValue({ id: 10 }),
    };

    const authServiceMock = {
      generateTokens: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };

    const sharedRoleRepoMock = {
      getClientRoleId: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleService,
        { provide: AuthRepository, useValue: authRepoMock },
        { provide: SharedRoleRepository, useValue: sharedRoleRepoMock },
        { provide: HashingService, useValue: { hash: jest.fn().mockResolvedValue('hashed') } },
        { provide: TokenService, useValue: {} },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    service = module.get<GoogleService>(GoogleService);
    authRepository = module.get<AuthRepository>(AuthRepository);
    authService = module.get<AuthService>(AuthService);
  });

  it('should generate an authorization URL', () => {
    const result = service.getAuthorizationUrl({ userAgent: 'test', ip: '127.0.0.1' });
    expect(result.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?scope=test&state=123');
  });

  it('should process callback and return tokens for existing user', async () => {
    authRepository.findUniqueIncludeRole.mockResolvedValue({ id: 1, roleId: 2, role: { name: 'CUSTOMER' } });
    
    const stateBase64 = Buffer.from(JSON.stringify({ userAgent: 'Jest', ip: '127.0.0.1' })).toString('base64');
    
    const result = await service.googleCallback({ state: stateBase64, code: 'mock_code' });
    
    expect(result.accessToken).toBe('a');
    expect(authService.generateTokens).toHaveBeenCalledWith({
      userId: 1,
      deviceId: 10,
      roleId: 2,
      roleName: 'CUSTOMER',
    });
  });

  it('should create a new user if not exists', async () => {
    authRepository.findUniqueIncludeRole.mockResolvedValue(null);
    authRepository.createUserIncludeRole.mockResolvedValue({ id: 2, roleId: 2, role: { name: 'CUSTOMER' } });

    const stateBase64 = Buffer.from(JSON.stringify({ userAgent: 'Jest', ip: '127.0.0.1' })).toString('base64');
    
    const result = await service.googleCallback({ state: stateBase64, code: 'mock_code' });
    
    expect(result.accessToken).toBe('a');
    expect(authRepository.createUserIncludeRole).toHaveBeenCalled();
  });
});
