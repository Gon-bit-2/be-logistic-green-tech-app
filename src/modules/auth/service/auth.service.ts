import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { addMilliseconds } from 'date-fns'
import {
  ForgotPasswordBodyType,
  LoginBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
  SendOTPBodyType,
  VerifyOTPBodyType,
} from 'src/modules/auth/model/auth.model'
import ms, { StringValue } from 'ms'
// import { EmailService } from 'src/shared/service/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'
import { PrismaService } from 'src/database/prisma.service'
import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'
import { TypeOfVerificationCode, TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { generateOTP } from 'src/common/utils/helpers'
import envConfig from 'src/config/config'
import { IAccessTokenPayload } from 'src/types/jwt.type'
import { EmailService } from 'src/common/services/email.service'
@Injectable()
export class AuthService {
  constructor(
    private readonly sharedRoleRepository: SharedRoleRepository,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly hashingService: HashingService,
    private readonly authRepository: AuthRepository,
    private readonly shareUserRepository: ShareUserRepository,
    private readonly verificationCodeRepository: VerificationCodeRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly prismaService: PrismaService,
  ) {}

  private getTwoFactorPendingSecretCacheKey(userId: number) {
    return `2fa:pending:${userId}`
  }

  async getProfile(userId: number) {
    const user = await this.shareUserRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = user
    return profile
  }

  async register(body: RegisterBodyType) {
    try {
      await this.validateVerificationCode({
        email: body.email,
        code: body.code,
        type: TypeOfVerificationCode.REGISTER,
      })
      const clientRoleId = await this.sharedRoleRepository.getClientRoleId()
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
      if (error && typeof error === 'object' && 'code' in error && String(error.code) === 'P2002') {
        throw new BadRequestException('Người Dùng Đã Tồn Tại')
      }
      throw error
    }
  }

  async sendOTP(body: SendOTPBodyType) {
    //1:check email exists
    const user = await this.shareUserRepository.findUnique({ email: body.email })
    if (body.type === TypeOfVerificationCode.REGISTER && user) {
      throw new UnprocessableEntityException([
        {
          message: 'Email đã tồn tại',
          path: 'email',
        },
      ])
    }
    if (body.type === TypeOfVerificationCode.FORGOT_PASSWORD && !user) {
      throw new UnprocessableEntityException([
        {
          message: 'Email không tồn tại',
          path: 'email',
        },
      ])
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
      throw new UnprocessableEntityException([
        {
          message: 'Email Không Tồn Tại',
          path: 'email',
        },
      ])
    }
    const isMatchPassword = await this.hashingService.compare(body.password, user.password)
    if (!isMatchPassword) {
      throw new UnprocessableEntityException([
        {
          message: 'Mật Khẩu Không Đúng',
          path: 'password',
        },
      ])
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
    })
    return tokens
  }

  async generateTokens({ userId, deviceId, roleId, roleName }: IAccessTokenPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    //
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)
    await this.authRepository.createRefreshToken({
      token: refreshToken,
      userId,
      expiresAt: new Date(decodedRefreshToken.exp * 1000),
      deviceId,
    })
    return { accessToken, refreshToken }
  }
  async refreshToken({ refreshToken, userAgent, ip }: RefreshTokenBodyType & { userAgent: string; ip: string }) {
    //1 check token hợp lệ
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)
    //2 check refreshtoken exist
    const tokenInDB = await this.authRepository.findUniqueRefreshTokenIncludeUserRole({
      token: refreshToken,
    })
    if (!tokenInDB) {
      throw new UnauthorizedException('Refresh Token đã sử dụng')
    }
    const {
      deviceId,
      user: {
        roleId,
        role: { name: roleName },
      },
    } = tokenInDB
    // 3. Chuẩn bị token mới (chỉ xử lý logic JWT, không ghi CSDL)
    const [newAccessToken, newRefreshTokenStr] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(newRefreshTokenStr)

    // 4. Chạy Transaction đảm bảo tính toàn vẹn dữ liệu
    await this.prismaService.$transaction([
      this.prismaService.device.update({
        where: { id: deviceId },
        data: { userAgent, ip },
      }),
      this.prismaService.refreshToken.delete({
        where: { token: refreshToken },
      }),
      this.prismaService.refreshToken.create({
        data: {
          token: newRefreshTokenStr,
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

      //2. delete token
      const deleteToken = await this.authRepository.deleteRefreshToken({ token: refreshToken })

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
    //1: check email exists
    const user = await this.shareUserRepository.findUnique({ email })
    if (!user) {
      throw new UnprocessableEntityException([
        {
          message: 'Email Không Tồn Tại',
          path: 'email',
        },
      ])
    }
    //2: kiểm tra mã otp hợp lệ
    await this.validateVerificationCode({
      email,
      code,
      type: TypeOfVerificationCode.FORGOT_PASSWORD,
    })
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
