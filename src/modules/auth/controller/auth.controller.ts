import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Get,
  Query,
  Res,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
} from '@nestjs/common'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import {
  AddressBookListResDTO,
  AddressBookResDTO,
  CreateAddressBookBodyDTO,
  ForgotPasswordBodyDTO,
  GetAuthorizationUrlResDTO,
  GoogleSessionBodyDTO,
  GoogleSessionResDTO,
  LoginBodyDTO,
  LoginResDTO,
  RefreshTokenBodyDTO,
  RegisterBodyDTO,
  RegisterResDTO,
  SendOPTBodyDTO,
  UpdateAddressBookBodyDTO,
  UpdateProfileBodyDTO,
  UpdateProfileResDTO,
  VerifyOTPBodyDTO,
} from 'src/modules/auth/dto/auth.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { GoogleService } from 'src/modules/auth/service/google.service'
import { type Response } from 'express'
import { Throttle } from '@nestjs/throttler'
import { isPublic } from 'src/common/decorators/auth.decorator'
import { MessageResDTO } from 'src/common/dtos/response.dto'
import { UserAgent } from 'src/common/decorators/user-agent.decorator'
import envConfig from 'src/config/config'
import { buildGoogleRedirectUrl } from 'src/modules/auth/utils/google-redirect.util'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleService: GoogleService,
  ) {}

  @Get('profile')
  getProfile(@ActiveUser('userId') userId: number) {
    return this.authService.getProfile(userId)
  }

  @Patch('profile')
  @ZodSerializerDto(UpdateProfileResDTO)
  updateProfile(@ActiveUser('userId') userId: number, @Body() body: UpdateProfileBodyDTO) {
    return this.authService.updateProfile(userId, body)
  }

  @Get('address-book')
  @ZodSerializerDto(AddressBookListResDTO)
  getAddressBooks(@ActiveUser('userId') userId: number) {
    return this.authService.getAddressBooks(userId)
  }

  @Post('address-book')
  @ZodSerializerDto(AddressBookResDTO)
  createAddressBook(@ActiveUser('userId') userId: number, @Body() body: CreateAddressBookBodyDTO) {
    return this.authService.createAddressBook(userId, body)
  }

  @Patch('address-book/:id')
  @ZodSerializerDto(AddressBookResDTO)
  updateAddressBook(
    @ActiveUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAddressBookBodyDTO,
  ) {
    return this.authService.updateAddressBook(userId, id, body)
  }

  @Delete('address-book/:id')
  @ZodSerializerDto(MessageResDTO)
  deleteAddressBook(@ActiveUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.authService.deleteAddressBook(userId, id)
  }

  @Throttle({
    default: { limit: 1, ttl: 60000 },
  })
  @Post('otp')
  @isPublic()
  async sendOTP(@Body() body: SendOPTBodyDTO) {
    return await this.authService.sendOTP(body)
  }
  @Post('verify-otp')
  @isPublic()
  @ZodSerializerDto(MessageResDTO)
  async verifyOTP(@Body() body: VerifyOTPBodyDTO) {
    return await this.authService.verifyOTP(body)
  }
  @Post('register')
  @isPublic()
  @ZodSerializerDto(RegisterResDTO)
  async register(@Body() body: RegisterBodyDTO) {
    return await this.authService.register(body)
  }

  @Post('login')
  @isPublic()
  @Throttle({
    default: { limit: 5, ttl: 60000 },
  })
  @ZodSerializerDto(LoginResDTO)
  login(@Body() body: LoginBodyDTO, @UserAgent() userAgent: string, @Ip() ip: string) {
    return this.authService.login({
      ...body,
      userAgent,
      ip,
    })
  }

  @Post('refresh-token')
  @isPublic()
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() body: RefreshTokenBodyDTO, @UserAgent() userAgent: string, @Ip() ip: string) {
    return this.authService.refreshToken({
      refreshToken: body.refreshToken,
      userAgent,
      ip,
    })
  }
  @Post('logout')
  @HttpCode(200)
  @ZodSerializerDto(MessageResDTO)
  logout(@Body() body: RefreshTokenBodyDTO) {
    return this.authService.logout(body.refreshToken)
  }
  @Get('google-link')
  @isPublic()
  @ZodSerializerDto(GetAuthorizationUrlResDTO)
  getAuthorizationUrl(@UserAgent() userAgent: string, @Ip() ip: string) {
    return this.googleService.getAuthorizationUrl({
      userAgent,
      ip,
    })
  }

  @Get('google/callback')
  @isPublic()
  async googleCallback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    try {
      if (error) {
        throw new Error(`Google OAuth error: ${error}`)
      }

      if (!code) {
        throw new Error('Thiếu mã xác thực từ Google')
      }

      const data = await this.googleService.googleCallback({ state, code })
      return res.redirect(
        buildGoogleRedirectUrl(envConfig.GOOGLE_CLIENT_REDIRECT_URI, {
          sessionToken: data.sessionToken,
        }),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Có lỗi khi đăng nhập bằng google vui lòng thử lại cách khác'
      return res.redirect(
        buildGoogleRedirectUrl(envConfig.GOOGLE_CLIENT_REDIRECT_URI, {
          errorMessage: message,
        }),
      )
    }
  }

  @Post('google/session')
  @isPublic()
  @ZodSerializerDto(GoogleSessionResDTO)
  exchangeGoogleSession(@Body() body: GoogleSessionBodyDTO) {
    return this.googleService.redeemGoogleSession(body.sessionToken)
  }

  @Post('forgot-password')
  @isPublic()
  @Throttle({
    default: { limit: 3, ttl: 900000 },
  })
  @ZodSerializerDto(MessageResDTO)
  forgotPassword(@Body() body: ForgotPasswordBodyDTO) {
    return this.authService.forgotPassword(body)
  }
  // @Post('2fa/setup')
  // @ZodSerializerDto(TwoFactorSetupResDTO)
  // twoFactorAuth(@Body() _: EmptyBodyDTO, @ActiveUser('userId') userid: number) {
  //   return this.authService.twoFactorAuth(userid)
  // }

  // @Post('2fa/verify')
  // @ZodSerializerDto(MessageResDTO)
  // verifyTwoFactorAuth(@Body() body: VerifyTwoFactorBodyDTO, @ActiveUser('userId') userId: number) {
  //   return this.authService.verifyAndEnableTwoFactorAuth({ userId, totpCode: body.totpCode })
  // }

  // @Post('2fa/disable')
  // @ZodSerializerDto(MessageResDTO)
  // disableTwoFactorAuth(@Body() body: DisableTwoFactorBodyDTO, @ActiveUser('userId') userId: number) {
  //   return this.authService.disableTwoFactorAuth({ ...body, userId })
  // }
}
