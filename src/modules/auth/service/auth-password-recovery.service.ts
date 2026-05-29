import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { ForgotPasswordBodyType } from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { HashingService } from 'src/common/services/hashing.service'
import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'
import { AuthOtpService } from './auth-otp.service'

@Injectable()
export class AuthPasswordRecoveryService {
  private static readonly INVALID_FORGOT_PASSWORD_MESSAGE = 'Thông tin đặt lại mật khẩu không hợp lệ'

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly prismaService: PrismaService,
    private readonly hashingService: HashingService,
    private readonly otpService: AuthOtpService,
  ) {}

  private buildInvalidForgotPasswordException() {
    return new UnprocessableEntityException([
      {
        message: AuthPasswordRecoveryService.INVALID_FORGOT_PASSWORD_MESSAGE,
        path: 'email',
      },
    ])
  }

  async forgotPassword(body: ForgotPasswordBodyType) {
    const { email, code, newPassword } = body
    const user = await this.authRepository.findUnique({ email })

    try {
      await this.otpService.validateVerificationCode({
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

    const hashedPassword = await this.hashingService.hash(newPassword)

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
