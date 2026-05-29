import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { LoginBodyType, RefreshTokenBodyType } from 'src/modules/auth/model/auth.model'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'
import { IAccessTokenPayload } from 'src/common/types/jwt.type'
import type { RoleNameType } from 'src/common/constants/role.constant'
import { AuthOtpService } from './auth-otp.service'

@Injectable()
export class AuthSessionService {
  private static readonly DUMMY_PASSWORD_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOeFKb1YI7DiIP9N6byN1Nsx3Rp3XIanG'
  private static readonly INVALID_LOGIN_MESSAGE = 'Email hoặc mật khẩu không chính xác'

  constructor(
    private readonly tokenService: TokenService,
    private readonly hashingService: HashingService,
    private readonly authRepository: AuthRepository,
    private readonly prismaService: PrismaService,
    private readonly otpService: AuthOtpService,
  ) {}

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex')
  }

  private buildInvalidLoginException() {
    return new UnprocessableEntityException([
      {
        message: AuthSessionService.INVALID_LOGIN_MESSAGE,
        path: 'email',
      },
    ])
  }

  async login(body: LoginBodyType & { userAgent: string; ip: string }) {
    const user = await this.authRepository.findUniqueIncludeRole({
      email: body.email,
    })
    if (!user) {
      await this.hashingService.compare(body.password, AuthSessionService.DUMMY_PASSWORD_HASH)
      throw this.buildInvalidLoginException()
    }
    const isMatchPassword = await this.hashingService.compare(body.password, user.password)
    if (!isMatchPassword) {
      throw this.buildInvalidLoginException()
    }

    if (user.totpSecret) {
      if (!body.code) {
        throw new UnprocessableEntityException([
          {
            message: 'Mã OTP không hợp lệ',
            path: 'code',
          },
        ])
      }
      await this.otpService.validateVerificationCode({
        email: user.email,
        code: body.code,
        type: TypeOfVerificationCode.LOGIN,
      })
    }
    const device = await this.authRepository.createDevice({
      userId: user.id,
      userAgent: body.userAgent,
      ip: body.ip,
    })
    return this.generateTokens({
      userId: user.id,
      deviceId: device.id,
      roleId: user.roleId,
      roleName: user.role.name as RoleNameType,
      hubId: user.hubId ?? null,
    })
  }

  async generateTokens({ userId, deviceId, roleId, roleName, hubId }: IAccessTokenPayload) {
    const resolvedHubId =
      hubId !== undefined ? hubId : ((await this.authRepository.findUnique({ id: userId }))?.hubId ?? null)

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName, hubId: resolvedHubId }),
      this.tokenService.signRefreshToken({ userId }),
    ])

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
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)
    const refreshTokenHash = this.hashRefreshToken(refreshToken)
    const refreshTokenCandidates = [refreshTokenHash, refreshToken]
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

    const [newAccessToken, newRefreshTokenStr] = await Promise.all([
      this.tokenService.signAccessToken({
        userId,
        deviceId,
        roleId,
        roleName: roleName as RoleNameType,
        hubId: hubId ?? null,
      }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(newRefreshTokenStr)
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshTokenStr)

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

      const deleteToken = await this.authRepository.deleteRefreshToken({
        tokenHash: storedRefreshToken.token,
      })

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
}
