import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { addMilliseconds } from 'date-fns'
import ms, { StringValue } from 'ms'
import { SendOTPBodyType, VerifyOTPBodyType } from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { TypeOfVerificationCode, TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { generateOTP } from 'src/common/utils/helpers'
import envConfig from 'src/config/config'
import { EmailService } from 'src/common/services/email.service'

@Injectable()
export class AuthOtpService {
  constructor(
    private readonly emailService: EmailService,
    private readonly authRepository: AuthRepository,
    private readonly verificationCodeRepository: VerificationCodeRepository,
  ) {}

  async sendOTP(body: SendOTPBodyType) {
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
}
