import { Controller, Post, Body, HttpCode, HttpStatus, Ip, Get, Query, Res } from '@nestjs/common'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import {
  ForgotPasswordBodyDTO,
  GetAuthorizationUrlResDTO,
  LoginBodyDTO,
  LoginResDTO,
  RefreshTokenBodyDTO,
  RegisterBodyDTO,
  RegisterResDTO,
  SendOPTBodyDTO,
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
  async googleCallback(@Query('state') state: string, @Query('code') code: string, @Res() res: Response) {
    try {
      const data = await this.googleService.googleCallback({ state, code })
      return res.redirect(
        `${envConfig.GOOGLE_CLIENT_REDIRECT_URI}?accessToken=${data.accessToken}&refreshToken=${data.refreshToken}`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Có lỗi khi đăng nhập bằng google vui lòng thử lại cách khác'
      return res.redirect(`${envConfig.GOOGLE_CLIENT_REDIRECT_URI}?errorMessage=${message}`)
    }
  }
  @Post('forgot-password')
  @isPublic()
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
