import { Injectable } from '@nestjs/common'
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
import { IAccessTokenPayload } from 'src/common/types/jwt.type'
import { AuthProfileService } from './auth-profile.service'
import { AuthAddressBookService } from './auth-address-book.service'
import { AuthOtpService } from './auth-otp.service'
import { AuthRegistrationService } from './auth-registration.service'
import { AuthSessionService } from './auth-session.service'
import { AuthPasswordRecoveryService } from './auth-password-recovery.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly profileService: AuthProfileService,
    private readonly addressBookService: AuthAddressBookService,
    private readonly otpService: AuthOtpService,
    private readonly registrationService: AuthRegistrationService,
    private readonly sessionService: AuthSessionService,
    private readonly passwordRecoveryService: AuthPasswordRecoveryService,
  ) {}

  getProfile(userId: number) {
    return this.profileService.getProfile(userId)
  }

  updateProfile(userId: number, body: UpdateProfileBodyType) {
    return this.profileService.updateProfile(userId, body)
  }

  getAddressBooks(userId: number) {
    return this.addressBookService.getAddressBooks(userId)
  }

  createAddressBook(userId: number, body: CreateAddressBookBodyType) {
    return this.addressBookService.createAddressBook(userId, body)
  }

  updateAddressBook(userId: number, addressBookId: number, body: UpdateAddressBookBodyType) {
    return this.addressBookService.updateAddressBook(userId, addressBookId, body)
  }

  deleteAddressBook(userId: number, addressBookId: number) {
    return this.addressBookService.deleteAddressBook(userId, addressBookId)
  }

  sendOTP(body: SendOTPBodyType) {
    return this.otpService.sendOTP(body)
  }

  verifyOTP(body: VerifyOTPBodyType) {
    return this.otpService.verifyOTP(body)
  }

  validateVerificationCode(input: Parameters<AuthOtpService['validateVerificationCode']>[0]) {
    return this.otpService.validateVerificationCode(input)
  }

  register(body: RegisterBodyType) {
    return this.registrationService.register(body)
  }

  login(body: LoginBodyType & { userAgent: string; ip: string }) {
    return this.sessionService.login(body)
  }

  generateTokens(payload: IAccessTokenPayload) {
    return this.sessionService.generateTokens(payload)
  }

  refreshToken(input: RefreshTokenBodyType & { userAgent: string; ip: string }) {
    return this.sessionService.refreshToken(input)
  }

  logout(refreshToken: string) {
    return this.sessionService.logout(refreshToken)
  }

  forgotPassword(body: ForgotPasswordBodyType) {
    return this.passwordRecoveryService.forgotPassword(body)
  }
}
