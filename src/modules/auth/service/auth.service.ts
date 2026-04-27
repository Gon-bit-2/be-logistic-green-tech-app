import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { addMilliseconds } from 'date-fns'
import { createHash } from 'node:crypto'
import {
  CreateAddressBookBodyType,
  ForgotPasswordBodyType,
  LoginBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
  SendOTPBodyType,
  UpdateAddressBookBodyType,
  UpdateProfileBodyType,
  VerifyOTPBodyType,
} from 'src/modules/auth/model/auth.model'
import ms, { StringValue } from 'ms'
// import { EmailService } from 'src/shared/service/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { TypeOfVerificationCode, TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { generateOTP } from 'src/common/utils/helpers'
import envConfig from 'src/config/config'
import { EmailService } from 'src/common/services/email.service'
import { IAccessTokenPayload } from 'src/common/types/jwt.type'
import { RoleRepository } from 'src/modules/role/repository/role.repo'
@Injectable()
export class AuthService {
  private static readonly DUMMY_PASSWORD_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOeFKb1YI7DiIP9N6byN1Nsx3Rp3XIanG'
  private static readonly INVALID_LOGIN_MESSAGE = 'Email hoặc mật khẩu không chính xác'
  private static readonly INVALID_FORGOT_PASSWORD_MESSAGE = 'Thông tin đặt lại mật khẩu không hợp lệ'

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly hashingService: HashingService,
    private readonly authRepository: AuthRepository,
    private readonly verificationCodeRepository: VerificationCodeRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly prismaService: PrismaService,
  ) {}

  private getTwoFactorPendingSecretCacheKey(userId: number) {
    return `2fa:pending:${userId}`
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex')
  }

  private buildInvalidLoginException() {
    return new UnprocessableEntityException([
      {
        message: AuthService.INVALID_LOGIN_MESSAGE,
        path: 'email',
      },
    ])
  }

  private buildInvalidForgotPasswordException() {
    return new UnprocessableEntityException([
      {
        message: AuthService.INVALID_FORGOT_PASSWORD_MESSAGE,
        path: 'email',
      },
    ])
  }

  private hasErrorCode(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  }

  async getProfile(userId: number) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = user
    return profile
  }

  async updateProfile(userId: number, body: UpdateProfileBodyType) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const updatedUser = await this.authRepository.update(
      { id: userId },
      {
        ...body,
        updatedById: userId,
      },
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = updatedUser
    return profile
  }

  async getAddressBooks(userId: number) {
    const data = await this.authRepository.findAddressBooksByUserId(userId)
    return { data }
  }

  async createAddressBook(userId: number, body: CreateAddressBookBodyType) {
    const totalItems = await this.authRepository.countActiveAddressBooksByUserId(userId)
    const isDefault = body.isDefault ?? totalItems === 0

    return await this.prismaService.$transaction(async (tx) => {
      if (isDefault) {
        await this.authRepository.clearDefaultAddressBooks(userId, undefined, tx)
      }

      return await this.authRepository.createAddressBook(
        {
          ...body,
          userId,
          isDefault,
        },
        tx,
      )
    })
  }

  async updateAddressBook(userId: number, addressBookId: number, body: UpdateAddressBookBodyType) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    return await this.prismaService.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await this.authRepository.clearDefaultAddressBooks(userId, addressBookId, tx)
      }

      return await this.authRepository.updateAddressBook(
        addressBookId,
        {
          ...body,
          ...(body.label !== undefined ? { label: body.label ?? null } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude ?? null } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude ?? null } : {}),
        },
        tx,
      )
    })
  }

  async deleteAddressBook(userId: number, addressBookId: number) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    await this.prismaService.$transaction(async (tx) => {
      await this.authRepository.updateAddressBook(
        addressBookId,
        {
          deletedAt: new Date(),
          isDefault: false,
        },
        tx,
      )

      if (existingAddress.isDefault) {
        const fallbackAddress = await this.authRepository.findFirstActiveAddressBookByUserId(userId, tx)
        if (fallbackAddress) {
          await this.authRepository.updateAddressBook(
            fallbackAddress.id,
            {
              isDefault: true,
            },
            tx,
          )
        }
      }
    })

    return {
      message: 'Xóa địa chỉ thành công',
    }
  }

  async register(body: RegisterBodyType) {
    try {
      await this.validateVerificationCode({
        email: body.email,
        code: body.code,
        type: TypeOfVerificationCode.REGISTER,
      })
      const clientRoleId = await this.roleRepository.getClientRoleId()
      const hashedPassword = await this.hashingService.hash(body.password)
      const [user] = await this.prismaService.$transaction([
        this.prismaService.user.create({
          data: {
            email: body.email,
            password: hashedPassword,
            fullName: body.fullName,
            phone: body.phone,
            roleId: clientRoleId,
          },
          omit: { password: true, totpSecret: true },
        }),
        this.prismaService.verificationCode.delete({
          where: {
            email_type: {
              email: body.email,
              type: TypeOfVerificationCode.REGISTER,
            },
          },
        }),
      ])
      return user
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error
      }
      if (this.hasErrorCode(error) && error.code === 'P2002') {
        throw new BadRequestException('Người Dùng Đã Tồn Tại')
      }
      throw error
    }
  }

  async sendOTP(body: SendOTPBodyType) {
    //1:check email exists
    const user = await this.authRepository.findUnique({ email: body.email })
    if (body.type === TypeOfVerificationCode.REGISTER && user) {
      throw new UnprocessableEntityException([
        {
          message: 'Email đã tồn tại',
          path: 'email',
        },
      ])
    }
    if (body.type === TypeOfVerificationCode.FORGOT_PASSWORD && !user) {
      return {
        message: 'Nếu email tồn tại, mã OTP đã được gửi',
      }
    }
    //2. Tạo mã OTP
    const code = generateOTP()
    await this.verificationCodeRepository.createVerificationCode({
      email: body.email,
      code,
      type: body.type,
      expiresAt: addMilliseconds(new Date(), ms(envConfig.OTP_EXPIRES_IN as StringValue)),
    })
    const { error } = await this.emailService.sendOTPToEMAIL({
      email: body.email,
      code,
    })
    if (error) {
      throw new UnprocessableEntityException({
        message: 'Send OTP FAIL',
        path: 'Code',
      })
    }
    return {
      message: 'Gửi Mã Otp thành công',
    }
  }
  async verifyOTP(body: VerifyOTPBodyType) {
    await this.validateVerificationCode({
      email: body.email,
      code: body.code,
      type: body.type,
    })
    return {
      message: 'Mã OTP hợp lệ',
    }
  }
  async validateVerificationCode({
    email,
    code,
    type,
  }: {
    email: string
    code: string
    type: TypeOfVerificationCodeType
  }) {
    const verificationCode = await this.authRepository.findUniqueVerificationCode({
      email,
      code,
      type,
    })
    if (!verificationCode) {
      throw new UnprocessableEntityException([
        {
          message: 'Mã OTP không hợp lệ',
          path: 'code',
        },
      ])
    }
    if (verificationCode.expiresAt < new Date()) {
      throw new UnprocessableEntityException([
        {
          message: 'Mã OTP đã hết hạn',
          path: 'code',
        },
      ])
    }
    return verificationCode
  }
  async login(body: LoginBodyType & { userAgent: string; ip: string }) {
    const user = await this.authRepository.findUniqueIncludeRole({
      email: body.email,
    })
    if (!user) {
      await this.hashingService.compare(body.password, AuthService.DUMMY_PASSWORD_HASH)
      throw this.buildInvalidLoginException()
    }
    const isMatchPassword = await this.hashingService.compare(body.password, user.password)
    if (!isMatchPassword) {
      throw this.buildInvalidLoginException()
    }
    //
    if (user.totpSecret) {
      if (!body.code) {
        throw new UnprocessableEntityException([
          {
            message: 'Mã OTP không hợp lệ',
            path: 'code',
          },
        ])
      }
      if (body.code) {
        await this.validateVerificationCode({
          email: user.email,
          code: body.code,
          type: TypeOfVerificationCode.LOGIN,
        })
      }
    }
    const device = await this.authRepository.createDevice({
      userId: user.id,
      userAgent: body.userAgent,
      ip: body.ip,
    })
    const tokens = await this.generateTokens({
      userId: user.id,
      deviceId: device.id,
      roleId: user.roleId,
      roleName: user.role.name,
      hubId: user.hubId ?? null,
    })
    return tokens
  }

  async generateTokens({ userId, deviceId, roleId, roleName, hubId }: IAccessTokenPayload) {
    const resolvedHubId =
      hubId !== undefined ? hubId : ((await this.authRepository.findUnique({ id: userId }))?.hubId ?? null)

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName, hubId: resolvedHubId }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    //
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)
    await this.authRepository.createRefreshToken({
      tokenHash: this.hashRefreshToken(refreshToken),
      userId,
      expiresAt: new Date(decodedRefreshToken.exp * 1000),
      deviceId,
    })
    return { accessToken, refreshToken }
  }
  async refreshToken({ refreshToken, userAgent, ip }: RefreshTokenBodyType & { userAgent: string; ip: string }) {
    //1 check token hợp lệ
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)
    const refreshTokenHash = this.hashRefreshToken(refreshToken)
    const refreshTokenCandidates = [refreshTokenHash, refreshToken]
    //2 check refreshtoken exist
    const tokenInDB = await this.authRepository.findFirstRefreshTokenIncludeUserRoleByTokens(refreshTokenCandidates)
    if (!tokenInDB) {
      throw new UnauthorizedException('Refresh Token đã sử dụng')
    }
    const {
      deviceId,
      user: {
        hubId,
        roleId,
        role: { name: roleName },
      },
      token: storedRefreshToken,
    } = tokenInDB
    // 3. Chuẩn bị token mới (chỉ xử lý logic JWT, không ghi CSDL)
    const [newAccessToken, newRefreshTokenStr] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName, hubId: hubId ?? null }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(newRefreshTokenStr)
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshTokenStr)

    // 4. Chạy Transaction đảm bảo tính toàn vẹn dữ liệu
    await this.prismaService.$transaction([
      this.prismaService.device.update({
        where: { id: deviceId },
        data: { userAgent, ip },
      }),
      this.prismaService.refreshToken.delete({
        where: { token: storedRefreshToken },
      }),
      this.prismaService.refreshToken.create({
        data: {
          token: newRefreshTokenHash,
          userId,
          expiresAt: new Date(decodedRefreshToken.exp * 1000),
          deviceId,
        },
      }),
    ])

    return { accessToken: newAccessToken, refreshToken: newRefreshTokenStr }
  }

  async logout(refreshToken: string) {
    try {
      //1. verify refreshtoken
      await this.tokenService.verifyRefreshToken(refreshToken)
      const storedRefreshToken = await this.authRepository.findFirstRefreshTokenByTokens([
        this.hashRefreshToken(refreshToken),
        refreshToken,
      ])
      if (!storedRefreshToken) {
        throw new UnauthorizedException({
          message: 'Refresh Token Đã Được sử dụng',
        })
      }

      //2. delete token
      const deleteToken = await this.authRepository.deleteRefreshToken({
        tokenHash: storedRefreshToken.token,
      })

      //3. cập nhập device
      await this.authRepository.updateDevice(deleteToken.deviceId, {
        isActive: false,
      })
      return {
        message: 'Đăng Xuất Thành Công',
      }
    } catch (error) {
      if (error instanceof Error)
        throw new UnauthorizedException({
          message: 'Refresh Token Đã Được sử dụng',
        })
    }
  }
  async forgotPassword(body: ForgotPasswordBodyType) {
    const { email, code, newPassword } = body
    const user = await this.authRepository.findUnique({ email })

    try {
      await this.validateVerificationCode({
        email,
        code,
        type: TypeOfVerificationCode.FORGOT_PASSWORD,
      })
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw this.buildInvalidForgotPasswordException()
      }
      throw error
    }
    if (!user) {
      throw this.buildInvalidForgotPasswordException()
    }
    //3: cập nhập và xóa đi otp
    const hashedPassword = await this.hashingService.hash(newPassword)

    // Chạy Transaction đảm bảo an toàn nếu một trong 2 query thất bại
    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, updatedById: user.id },
      }),
      this.prismaService.verificationCode.delete({
        where: {
          email_type: {
            email: body.email,
            type: TypeOfVerificationCode.FORGOT_PASSWORD,
          },
        },
      }),
    ])
    return {
      message: 'Đổi Mật Khẩu Thành Công',
    }
  }
}
