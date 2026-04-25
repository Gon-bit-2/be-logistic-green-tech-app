import React from 'react'
import { Injectable } from '@nestjs/common'
import { OTPVerificationEmail } from 'emails/otp'
import { Resend } from 'resend'
import envConfig from 'src/config/config'

@Injectable()
export class EmailService {
  private resend: Resend
  constructor() {
    this.resend = new Resend(envConfig.RESEND_API_KEY)
  }

  sendOTPToEMAIL = async (payload: { email: string; code: string }) => {
    // const otpTemplate = fs.readFileSync(path.resolve('src/shared/template/email/email-otp.html'), {
    //   encoding: 'utf8',
    // })
    const subject = 'Mã OTP'
    return await this.resend.emails.send({
      from: 'thiendev <no-reply@gonshoe.online>',
      to: [payload.email],
      subject: subject,
      react: <OTPVerificationEmail otpCode={payload.code} title={subject} />,
    })
  }
}
