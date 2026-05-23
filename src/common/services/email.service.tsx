import React from 'react'
import { Injectable } from '@nestjs/common'
import { OTPVerificationEmail } from 'emails/otp'
import { Resend } from 'resend'
import envConfig from 'src/config/config'

/**
 * Service that handles sending emails using the Resend API provider.
 * Service xử lý gửi email sử dụng nhà cung cấp API Resend.
 *
 * Integrates React-based email templates (like OTPVerificationEmail) to send interactive
 * and visually rich emails to users.
 * Tích hợp các template email dựa trên React (như OTPVerificationEmail) để gửi các email
 * sinh động và giàu tương tác cho người dùng.
 */
@Injectable()
export class EmailService {
  private resend: Resend
  constructor() {
    this.resend = new Resend(envConfig.RESEND_API_KEY)
  }

  /**
   * Sends an OTP verification email to a specific user email address.
   * Gửi một email xác thực mã OTP tới một địa chỉ email người dùng cụ thể.
   *
   * Renders the React-based `OTPVerificationEmail` component.
   * Renders component React `OTPVerificationEmail`.
   *
   * @param {object} payload - Email sending parameters.
   * @param {object} payload - Tham số gửi email.
   * @param {string} payload.email - The destination email address.
   * @param {string} payload.email - Địa chỉ email đích.
   * @param {string} payload.code - The verification OTP code string.
   * @param {string} payload.code - Chuỗi mã OTP xác thực.
   * @returns {Promise<any>} Response from the Resend API provider.
   * @returns {Promise<any>} Phản hồi từ nhà cung cấp API Resend.
   */
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
