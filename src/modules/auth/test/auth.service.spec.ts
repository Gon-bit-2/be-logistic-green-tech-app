import { Test, TestingModule } from '@nestjs/testing'
import { AuthService } from '../service/auth.service'
import { EmailService } from 'src/common/services/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from '../repository/auth.repository'
import { VerificationCodeRepository } from '../repository/verificationCode.repo'
import { PrismaService } from 'src/database/prisma.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'
import { RegisterResSchema } from '../model/auth.model'
import { addMilliseconds } from 'date-fns'
import { RoleRepository } from 'src/modules/role/repository/role.repo'

type PrismaServiceMock = {
  $transaction: jest.Mock
  user: { create: jest.Mock; update: jest.Mock }
  verificationCode: { delete: jest.Mock }
  device: { update: jest.Mock }
  refreshToken: { delete: jest.Mock; create: jest.Mock }
}

type TransactionCallback = (tx: Record<string, never>) => unknown

describe('AuthService', () => {
  let service: AuthService
  let roleRepo: jest.Mocked<RoleRepository>
  let emailService: jest.Mocked<EmailService>
  let tokenService: jest.Mocked<TokenService>
  let hashingService: jest.Mocked<HashingService>
  let authRepo: jest.Mocked<AuthRepository>
  let verificationCodeRepo: jest.Mocked<VerificationCodeRepository>
  let prismaService: PrismaServiceMock

  beforeEach(async () => {
    const roleRepoMock = { getClientRoleId: jest.fn() }
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
      findFirstRefreshTokenIncludeUserRoleByTokens: jest.fn(),
      findFirstRefreshTokenByTokens: jest.fn(),
      deleteRefreshToken: jest.fn(),
      updateDevice: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findAddressBooksByUserId: jest.fn(),
      countActiveAddressBooksByUserId: jest.fn(),
      clearDefaultAddressBooks: jest.fn(),
      createAddressBook: jest.fn(),
      findAddressBookByIdForUser: jest.fn(),
      findFirstActiveAddressBookByUserId: jest.fn(),
      updateAddressBook: jest.fn(),
    }
    const verificationCodeRepoMock = {
      findUniqueVerificationCode: jest.fn(),
      createVerificationCode: jest.fn(),
    }
    const prismaServiceMock: PrismaServiceMock = {
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
        { provide: RoleRepository, useValue: roleRepoMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: HashingService, useValue: hashingServiceMock },
        { provide: AuthRepository, useValue: authRepoMock },
        { provide: VerificationCodeRepository, useValue: verificationCodeRepoMock },
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: CACHE_MANAGER, useValue: cacheManagerMock },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    roleRepo = module.get(RoleRepository)
    emailService = module.get(EmailService)
    tokenService = module.get(TokenService)
    hashingService = module.get(HashingService)
    authRepo = module.get(AuthRepository)
    verificationCodeRepo = module.get(VerificationCodeRepository)
    prismaService = module.get(PrismaService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('updateProfile', () => {
    it('cập nhật profile thành công', async () => {
      authRepo.findUnique.mockResolvedValue({ id: 1 } as any)
      authRepo.update.mockResolvedValue({
        id: 1,
        email: 'test@mail.com',
        fullName: 'Updated User',
        phone: '0987654321',
        avatar: null,
        password: 'hashed_password',
        totpSecret: null,
      } as any)

      const res = await service.updateProfile(1, {
        fullName: 'Updated User',
        phone: '0987654321',
      })

      expect(authRepo.update.mock.calls).toContainEqual([
        { id: 1 },
        {
          fullName: 'Updated User',
          phone: '0987654321',
          updatedById: 1,
        },
      ])
      expect(res).toMatchObject({
        id: 1,
        email: 'test@mail.com',
        fullName: 'Updated User',
      })
      expect('password' in res).toBe(false)
    })

    it('văng Unauthorized khi user không tồn tại', async () => {
      authRepo.findUnique.mockResolvedValue(null)

      await expect(service.updateProfile(999, { fullName: 'Missing User' })).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('addressBook', () => {
    it('trả về danh sách address book của user', async () => {
      authRepo.findAddressBooksByUserId.mockResolvedValue([{ id: 1, contactName: 'Home' }] as any)

      const res = await service.getAddressBooks(1)

      expect(authRepo.findAddressBooksByUserId.mock.calls).toContainEqual([1])
      expect(res).toEqual({
        data: [{ id: 1, contactName: 'Home' }],
      })
    })

    it('tạo địa chỉ đầu tiên sẽ tự đặt mặc định', async () => {
      authRepo.countActiveAddressBooksByUserId.mockResolvedValue(0)
      authRepo.createAddressBook.mockResolvedValue({ id: 1, isDefault: true } as any)
      prismaService.$transaction.mockImplementation((callback: TransactionCallback) => callback({}))

      const res = await service.createAddressBook(1, {
        contactName: 'Nhà riêng',
        phone: '0987654321',
        address: '123 Nguyen Trai',
        label: 'Home',
        latitude: null,
        longitude: null,
      })

      expect(authRepo.clearDefaultAddressBooks.mock.calls).toContainEqual([1, undefined, {}])
      expect(authRepo.createAddressBook.mock.calls).toContainEqual([
        expect.objectContaining({
          userId: 1,
          isDefault: true,
        }),
        {},
      ])
      expect(res).toEqual({ id: 1, isDefault: true })
    })

    it('cập nhật địa chỉ mặc định sẽ bỏ mặc định các địa chỉ khác', async () => {
      authRepo.findAddressBookByIdForUser.mockResolvedValue({ id: 10, userId: 1 } as any)
      authRepo.updateAddressBook.mockResolvedValue({ id: 10, isDefault: true } as any)
      prismaService.$transaction.mockImplementation((callback: TransactionCallback) => callback({}))

      const res = await service.updateAddressBook(1, 10, {
        isDefault: true,
        label: 'Office',
      })

      expect(authRepo.clearDefaultAddressBooks.mock.calls).toContainEqual([1, 10, {}])
      expect(authRepo.updateAddressBook.mock.calls).toContainEqual([
        10,
        expect.objectContaining({
          isDefault: true,
          label: 'Office',
        }),
        {},
      ])
      expect(res).toEqual({ id: 10, isDefault: true })
    })

    it('xóa địa chỉ mặc định sẽ gán mặc định cho địa chỉ tiếp theo', async () => {
      authRepo.findAddressBookByIdForUser.mockResolvedValue({ id: 10, userId: 1, isDefault: true } as any)
      authRepo.findFirstActiveAddressBookByUserId.mockResolvedValue({ id: 11 } as any)
      prismaService.$transaction.mockImplementation((callback: TransactionCallback) => callback({}))

      const res = await service.deleteAddressBook(1, 10)

      expect(authRepo.updateAddressBook.mock.calls[0]).toEqual([
        10,
        expect.objectContaining({
          isDefault: false,
          deletedAt: expect.any(Date),
        }),
        {},
      ])
      expect(authRepo.updateAddressBook.mock.calls[1]).toEqual([
        11,
        {
          isDefault: true,
        },
        {},
      ])
      expect(res).toEqual({
        message: 'Xóa địa chỉ thành công',
      })
    })
  })

  describe('register', () => {
    it('đăng ký thành công', async () => {
      authRepo.findUniqueVerificationCode.mockResolvedValue({
        code: '123456',
        expiresAt: addMilliseconds(new Date(), 100000), // Vẫn còn hạn
      } as any)

      roleRepo.getClientRoleId.mockResolvedValue(2)
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
      expect(prismaService.$transaction.mock.calls.length).toBeGreaterThan(0)
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
      roleRepo.getClientRoleId.mockResolvedValue(2)
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
      authRepo.findUnique.mockResolvedValue(null) // ko tồn tại hợp lý để REGISTER
      verificationCodeRepo.createVerificationCode.mockResolvedValue({} as any)
      emailService.sendOTPToEMAIL.mockResolvedValue({ error: null } as any)

      const res = await service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.REGISTER })
      expect(res.message).toBe('Gửi Mã Otp thành công')
    })

    it('văng lỗi nếu user đăng ký trùng Email', async () => {
      authRepo.findUnique.mockResolvedValue({ id: 1 } as any)
      await expect(service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.REGISTER })).rejects.toThrow(
        UnprocessableEntityException,
      )
    })

    it('văng lỗi nếu gửi mã FORGOT cho email ko tồn tại', async () => {
      authRepo.findUnique.mockResolvedValue(null) // Ko tồn tại
      await expect(service.sendOTP({ email: 't@t.c', type: TypeOfVerificationCode.FORGOT_PASSWORD })).resolves.toEqual({
        message: 'Nếu email tồn tại, mã OTP đã được gửi',
      })
      expect(verificationCodeRepo.createVerificationCode.mock.calls).toHaveLength(0)
      expect(emailService.sendOTPToEMAIL.mock.calls).toHaveLength(0)
    })

    it('văng lỗi nếu Gửi Mail Fail qua provider', async () => {
      authRepo.findUnique.mockResolvedValue(null)
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
        hubId: 8,
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
      expect(tokenService.signAccessToken.mock.calls).toContainEqual([
        {
          userId: 1,
          deviceId: 10,
          roleId: 2,
          roleName: 'CUSTOMER',
          hubId: 8,
        },
      ])
    })

    it('Báo lỗi sai email', async () => {
      authRepo.findUniqueIncludeRole.mockResolvedValue(null)
      hashingService.compare.mockResolvedValue(false)
      await expect(
        service.login({ email: 't@t.c', password: 'password', ip: '1.2.3.4', userAgent: 'Chrome' }),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(hashingService.compare.mock.calls.length).toBeGreaterThan(0)
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
      authRepo.findFirstRefreshTokenIncludeUserRoleByTokens.mockResolvedValue({
        deviceId: 10,
        token: 'stored-refresh-token',
        user: { roleId: 2, hubId: 6, role: { name: 'CUST' } },
      } as any)
      tokenService.signAccessToken.mockResolvedValue('newAT')
      tokenService.signRefreshToken.mockResolvedValue('newRT')

      const res = await service.refreshToken({ refreshToken: 'oldRT', userAgent: 'X', ip: '127' })
      expect(res).toEqual({ accessToken: 'newAT', refreshToken: 'newRT' })
      expect(authRepo.findFirstRefreshTokenIncludeUserRoleByTokens.mock.calls[0]?.[0]).toEqual(expect.any(Array))
      expect(tokenService.signAccessToken.mock.calls).toContainEqual([
        {
          userId: 1,
          deviceId: 10,
          roleId: 2,
          roleName: 'CUST',
          hubId: 6,
        },
      ])
      expect(prismaService.$transaction.mock.calls.length).toBeGreaterThan(0)
    })

    it('văng Unauthorized khi db k thấy RT cũ (tức là đã revoke)', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ userId: 1 } as any)
      authRepo.findFirstRefreshTokenIncludeUserRoleByTokens.mockResolvedValue(null)
      await expect(service.refreshToken({ refreshToken: 'RT', ip: '1', userAgent: '1' })).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('generateTokens', () => {
    it('fallback query user để đưa hubId vào access token khi caller chưa truyền', async () => {
      authRepo.findUnique.mockResolvedValue({ id: 4, hubId: 12 } as any)
      tokenService.signAccessToken.mockResolvedValue('AT')
      tokenService.signRefreshToken.mockResolvedValue('RT')
      tokenService.verifyRefreshToken.mockResolvedValue({ exp: Math.floor(Date.now() / 1000) + 1000 } as any)

      const res = await service.generateTokens({
        userId: 4,
        deviceId: 9,
        roleId: 4,
        roleName: 'WAREHOUSE_STAFF',
      })

      expect(res).toEqual({ accessToken: 'AT', refreshToken: 'RT' })
      expect(authRepo.findUnique.mock.calls).toContainEqual([{ id: 4 }])
      expect(tokenService.signAccessToken.mock.calls).toContainEqual([
        {
          userId: 4,
          deviceId: 9,
          roleId: 4,
          roleName: 'WAREHOUSE_STAFF',
          hubId: 12,
        },
      ])
    })
  })

  describe('logout', () => {
    it('đăng xuất và disable device', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({} as any)
      authRepo.findFirstRefreshTokenByTokens.mockResolvedValue({ token: 'stored-refresh-token', deviceId: 10 } as any)
      authRepo.deleteRefreshToken.mockResolvedValue({ deviceId: 10 } as any)

      const res = await service.logout('RT')
      expect(res).toMatchObject({ message: 'Đăng Xuất Thành Công' })
      expect(authRepo.updateDevice.mock.calls).toContainEqual([10, { isActive: false }])
    })

    it('văng Unauthorized nếu token k hợp lệ', async () => {
      tokenService.verifyRefreshToken.mockRejectedValue(new Error('Invalid token'))
      await expect(service.logout('RT')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('đổi mật khẩu thành công', async () => {
      authRepo.findUnique.mockResolvedValue({ id: 1, email: 't@t.c' } as any)
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
      expect(prismaService.$transaction.mock.calls.length).toBeGreaterThan(0)
    })

    it('thất bại do email k tồn tại', async () => {
      authRepo.findUnique.mockResolvedValue(null)
      await expect(
        service.forgotPassword({ email: 'nope', code: '', newPassword: '', confirmNewPassword: '' }),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('thất bại do mã OTP không hợp lệ nhưng không lộ chi tiết', async () => {
      authRepo.findUnique.mockResolvedValue({ id: 1, email: 't@t.c' } as any)
      authRepo.findUniqueVerificationCode.mockResolvedValue(null)

      await expect(
        service.forgotPassword({ email: 't@t.c', code: '000000', newPassword: 'NEW123', confirmNewPassword: 'NEW123' }),
      ).rejects.toThrow(UnprocessableEntityException)
    })
  })
})
