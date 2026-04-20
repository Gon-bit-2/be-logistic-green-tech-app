// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { AuthService } from '../service/auth.service'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'
import { EmailService } from 'src/common/services/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from '../repository/auth.repository'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'
import { VerificationCodeRepository } from '../repository/verificationCode.repo'
import { PrismaService } from 'src/database/prisma.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'
import { RegisterResSchema } from '../model/auth.model'
import { addMilliseconds } from 'date-fns'

describe('AuthService', () => {
  let service: AuthService
  let sharedRoleRepo: jest.Mocked<SharedRoleRepository>
  let emailService: jest.Mocked<EmailService>
  let tokenService: jest.Mocked<TokenService>
  let hashingService: jest.Mocked<HashingService>
  let authRepo: jest.Mocked<AuthRepository>
  let shareUserRepo: jest.Mocked<ShareUserRepository>
  let verificationCodeRepo: jest.Mocked<VerificationCodeRepository>
  let prismaService: any
  let cacheManager: any

  beforeEach(async () => {
    const sharedRoleRepoMock = { getClientRoleId: jest.fn() }
    const emailServiceMock = { sendOTPToEMAIL: jest.fn() }
    const tokenServiceMock = {
      signAccessToken: jest.fn(),
      signRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    }
    const hashingServiceMock = { hash: jest.fn(), compare: jest.fn() }
    const authRepoMock = {
      findUniqueVerificationCode: jest.fn(),
      findUniqueIncludeRole: jest.fn(),
      createDevice: jest.fn(),
      createRefreshToken: jest.fn(),
      findUniqueRefreshTokenIncludeUserRole: jest.fn(),
      deleteRefreshToken: jest.fn(),
      updateDevice: jest.fn(),
    }
    const shareUserRepoMock = { findUnique: jest.fn() }
    const verificationCodeRepoMock = {
      findUniqueVerificationCode: jest.fn(),
      createVerificationCode: jest.fn(),
    }
    const prismaServiceMock = {
      $transaction: jest.fn(),
      user: { create: jest.fn(), update: jest.fn() },
      verificationCode: { delete: jest.fn() },
      device: { update: jest.fn() },
      refreshToken: { delete: jest.fn(), create: jest.fn() },
    }
    const cacheManagerMock = { get: jest.fn(), set: jest.fn(), del: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SharedRoleRepository, useValue: sharedRoleRepoMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: HashingService, useValue: hashingServiceMock },
        { provide: AuthRepository, useValue: authRepoMock },
        { provide: ShareUserRepository, useValue: shareUserRepoMock },
        { provide: VerificationCodeRepository, useValue: verificationCodeRepoMock },
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: CACHE_MANAGER, useValue: cacheManagerMock },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    sharedRoleRepo = module.get(SharedRoleRepository)
    emailService = module.get(EmailService)
    tokenService = module.get(TokenService)
    hashingService = module.get(HashingService)
    authRepo = module.get(AuthRepository)
    shareUserRepo = module.get(ShareUserRepository)
    verificationCodeRepo = module.get(VerificationCodeRepository)
    prismaService = module.get(PrismaService)
    cacheManager = module.get(CACHE_MANAGER)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('đăng ký thành công', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue({
        code: '123456',
        expiresAt: addMilliseconds(new Date(), 100000), // Vẫn còn hạn
      } as any)

      sharedRoleRepo.getClientRoleId.mockResolvedValue(2)
      hashingService.hash.mockResolvedValue('hashed_password')
      prismaService.$transaction.mockResolvedValue([
        {
          id: 1,
          email: 'test@mail.com',
          fullName: 'Tester',
          phone: '0123456789',
          avatar: null,
          isDeleted: false,
          roleId: 2,
          hubId: null,
          createdById: null,
          updatedById: null,
          deletedAt: null,
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          updatedAt: new Date('2026-04-20T00:00:00.000Z'),
        },
      ])

      const res = await service.register({
        email: 'test@mail.com',
        password: 'test',
        fullName: 'Tester',
        phone: '0123456789',
        confirmPassword: 'test',
        code: '123456',
      })

      expect(res).toMatchObject({ id: 1, email: 'test@mail.com' })
      expect(RegisterResSchema.safeParse(res).success).toBe(true)
      expect(prismaService.$transaction).toHaveBeenCalled()
    })

    it('văng UnprocessableEntityException do mã OTP không hợp lệ', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue(null)
      await expect(
        service.register({
          email: 'test@mail.com',
          password: 'test',
          fullName: 'Tester',
          phone: '0123',
          confirmPassword: 'test',
          code: '123456',
        }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('văng UnprocessableEntityException do mã OTP hết hạn', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue({
        code: '123456',
        expiresAt: addMilliseconds(new Date(), -100000), // Đã hết hạn
      } as any)
      await expect(
        service.register({
          email: 'test@mail.com',
          password: 'test',
          fullName: 'Tester',
          phone: '0123',
          confirmPassword: 'test',
          code: '123456',
        }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('văng UnprocessableEntityException khi OTP sai', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue(null)

      await expect(
        service.register({
          email: 'test@mail.com',
          password: 'test',
          fullName: 'Tester',
          phone: '0123',
          confirmPassword: 'test',
          code: '000000',
        }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('văng BadRequestException khi prisma transaction throw error (user existed)', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue({ expiresAt: addMilliseconds(new Date(), 100000) } as any)
      sharedRoleRepo.getClientRoleId.mockResolvedValue(2)
      prismaService.$transaction.mockRejectedValue({ code: 'P2002' })

      await expect(
        service.register({
          email: 'test@mail.com',
          password: 'test',
          fullName: 'Tester',
          phone: '0123',
          confirmPassword: 'test',
          code: '123456',
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('sendOTP', () => {
    it('gửi OTP đăng ký thành công (Email ko tồn tại mới cho chạy)', async () => {
      shareUserRepo.findUnique.mockResolvedValue(null) // ko tồn tại hợp lý để REGISTER
      verificationCodeRepo.createVerificationCode.mockResolvedValue({} as any)
      emailService.sendOTPToEMAIL.mockResolvedValue({ error: null } as any)

      const res = await service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.REGISTER })
      expect(res.message).toBe('Gửi Mã Otp thành công')
    })

    it('văng lỗi nếu user đăng ký trùng Email', async () => {
      shareUserRepo.findUnique.mockResolvedValue({ id: 1 } as any)
      await expect(service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.REGISTER })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })

    it('văng lỗi nếu gửi mã FORGOT cho email ko tồn tại', async () => {
      shareUserRepo.findUnique.mockResolvedValue(null) // Ko tồn tại
      await expect(service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.FORGOT_PASSWORD })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })

    it('văng lỗi nếu Gửi Mail Fail qua provider', async () => {
      shareUserRepo.findUnique.mockResolvedValue(null)
      emailService.sendOTPToEMAIL.mockResolvedValue({ error: new Error('SendGrid Error') } as any)

      await expect(service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.REGISTER })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })
  })

  describe('login', () => {
    it('Đăng nhập thành công', async () => {
      authRepo.findUniqueIncludeRole.mockResolvedValue({
        id: 1,
        email: 't@t.c',
        password: 'hashed',
        roleId: 2,
        role: { name: 'CUSTOMER' },
        totpSecret: null,
      } as any)
      hashingService.compare.mockResolvedValue(true)
      authRepo.createDevice.mockResolvedValue({ id: 10 } as any)
      tokenService.signAccessToken.mockResolvedValue('AT')
      tokenService.signRefreshToken.mockResolvedValue('RT')
      tokenService.verifyRefreshToken.mockResolvedValue({ exp: Math.floor(Date.now() / 1000) + 1000 } as any)

      const res = await service.login({ email: 't@t.c', password: 'password', ip: '1.2.3.4', userAgent: 'Chrome' })
      expect(res).toEqual({ accessToken: 'AT', refreshToken: 'RT' })
    })

    it('Báo lỗi sai email', async () => {
      authRepo.findUniqueIncludeRole.mockResolvedValue(null)
      await expect(
        service.login({ email: 't@t.c', password: 'password', ip: '1.2.3.4', userAgent: 'Chrome' }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('Báo lỗi sai mật khẩu', async () => {
      authRepo.findUniqueIncludeRole.mockResolvedValue({ id: 1, password: 'hashed' } as any)
      hashingService.compare.mockResolvedValue(false)
      await expect(
        service.login({ email: 't@t.c', password: 'password', ip: '1.2.3.4', userAgent: 'Chrome' }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('Cần code do bật 2FA/totp', async () => {
      authRepo.findUniqueIncludeRole.mockResolvedValue({ id: 1, password: 'hashed', totpSecret: 'secret' } as any)
      hashingService.compare.mockResolvedValue(true)

      // Thiếu code -> throw
      await expect(service.login({ email: 't@t.c', password: 'password', ip: '1', userAgent: '1' })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })
  })

  describe('refreshToken', () => {
    it('refresh token thành công', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ userId: 1, exp: 99999 } as any)
      authRepo.findUniqueRefreshTokenIncludeUserRole.mockResolvedValue({
        deviceId: 10,
        user: { roleId: 2, role: { name: 'CUST' } },
      } as any)
      tokenService.signAccessToken.mockResolvedValue('newAT')
      tokenService.signRefreshToken.mockResolvedValue('newRT')

      const res = await service.refreshToken({ refreshToken: 'oldRT', userAgent: 'X', ip: '127' })
      expect(res).toEqual({ accessToken: 'newAT', refreshToken: 'newRT' })
      expect(prismaService.$transaction).toHaveBeenCalled() // Ensure the database rotated the code
    })

    it('văng Unauthorized khi db k thấy RT cũ (tức là đã revoke)', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ userId: 1 } as any)
      authRepo.findUniqueRefreshTokenIncludeUserRole.mockResolvedValue(null)
      await expect(service.refreshToken({ refreshToken: 'RT', ip: '1', userAgent: '1' })).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('logout', () => {
    it('đăng xuất và disable device', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({} as any)
      authRepo.deleteRefreshToken.mockResolvedValue({ deviceId: 10 } as any)

      const res = await service.logout('RT')
      expect(res.message).toBe('Đăng Xuất Thành Công')
      expect(authRepo.updateDevice).toHaveBeenCalledWith(10, { isActive: false })
    })

    it('văng Unauthorized nếu token k hợp lệ', async () => {
      tokenService.verifyRefreshToken.mockRejectedValue(new Error('Invalid token'))
      await expect(service.logout('RT')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('đổi mật khẩu thành công', async () => {
      shareUserRepo.findUnique.mockResolvedValue({ id: 1, email: 't@t.c' } as any)
      authRepo.findUniqueVerificationCode.mockResolvedValue({ expiresAt: addMilliseconds(new Date(), 100000) } as any)
      hashingService.hash.mockResolvedValue('newHash')
      prismaService.$transaction.mockResolvedValue([{}, {}])

      const res = await service.forgotPassword({
        email: 't@t.c',
        code: '123',
        newPassword: 'NEW',
        confirmNewPassword: 'NEW',
      })
      expect(res.message).toBe('Đổi Mật Khẩu Thành Công')
      expect(prismaService.$transaction).toHaveBeenCalled()
    })

    it('thất bại do email k tồn tại', async () => {
      shareUserRepo.findUnique.mockResolvedValue(null)
      await expect(
        service.forgotPassword({ email: 'nope', code: '', newPassword: '', confirmNewPassword: '' }),
      ).rejects.toThrow(UnprocessableEntityException)
    })
  })
})
