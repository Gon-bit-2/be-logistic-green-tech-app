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

const DEFAULT_GOOGLE_LOGIN_ERROR_MESSAGE = 'Có lỗi khi đăng nhập bằng google vui lòng thử lại cách khác'
const PUBLIC_GOOGLE_CALLBACK_ERROR_MESSAGES = new Set([
  'Thiếu mã xác thực từ Google',
  'Google OAuth state không hợp lệ hoặc đã hết hạn',
  'Không thể lấy thông tin người dùng',
])

function getGoogleCallbackErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return DEFAULT_GOOGLE_LOGIN_ERROR_MESSAGE
  }

  const message = error.message.trim()

  if (PUBLIC_GOOGLE_CALLBACK_ERROR_MESSAGES.has(message) || message.startsWith('Google OAuth error: ')) {
    return message
  }

  return DEFAULT_GOOGLE_LOGIN_ERROR_MESSAGE
}

/**
 * Controller that handles user authentication and profile/address-book management.
 * Controller xử lý xác thực người dùng và quản lý hồ sơ/sổ địa chỉ.
 *
 * Implements endpoints for registration, login, logout, OTP verification, password reset,
 * session refreshing, Google OAuth, profile management, and address book CRUD operations.
 * Triển khai các endpoint cho đăng ký, đăng nhập, đăng xuất, xác thực OTP, đặt lại mật khẩu,
 * làm mới phiên, Google OAuth, quản lý hồ sơ và các hoạt động CRUD của sổ địa chỉ.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleService: GoogleService,
  ) {}

  /**
   * Retrieves the profile details of the currently logged-in user.
   * Lấy thông tin chi tiết hồ sơ của người dùng đang đăng nhập hiện tại.
   *
   * @param {number} userId - The authenticated user ID extracted from request context.
   * @param {number} userId - ID người dùng đã xác thực được trích xuất từ ngữ cảnh request.
   * @returns Profile details excluding password hash and TOTP secrets.
   * @returns Chi tiết hồ sơ không bao gồm mã băm mật khẩu và khóa bí mật TOTP.
   */
  @Get('profile')
  getProfile(@ActiveUser('userId') userId: number) {
    return this.authService.getProfile(userId)
  }

  /**
   * Updates the profile details of the currently logged-in user.
   * Cập nhật thông tin chi tiết hồ sơ của người dùng đang đăng nhập hiện tại.
   *
   * @param {number} userId - The authenticated user ID.
   * @param {number} userId - ID người dùng đã xác thực.
   * @param {UpdateProfileBodyDTO} body - DTO containing updated profile fields.
   * @param {UpdateProfileBodyDTO} body - DTO chứa các trường hồ sơ cần cập nhật.
   * @returns The updated profile details.
   * @returns Chi tiết hồ sơ đã cập nhật.
   */
  @Patch('profile')
  @ZodSerializerDto(UpdateProfileResDTO)
  updateProfile(@ActiveUser('userId') userId: number, @Body() body: UpdateProfileBodyDTO) {
    return this.authService.updateProfile(userId, body)
  }

  /**
   * Retrieves the address book entries of the currently logged-in user.
   * Lấy danh sách các địa chỉ trong sổ địa chỉ của người dùng đang đăng nhập.
   *
   * @param {number} userId - The authenticated user ID.
   * @param {number} userId - ID người dùng đã xác thực.
   * @returns {Promise<AddressBookListResDTO>} List of address book entries.
   * @returns {Promise<AddressBookListResDTO>} Danh sách các bản ghi sổ địa chỉ.
   */
  @Get('address-book')
  @ZodSerializerDto(AddressBookListResDTO)
  getAddressBooks(@ActiveUser('userId') userId: number) {
    return this.authService.getAddressBooks(userId)
  }

  /**
   * Creates a new address book entry for the currently logged-in user.
   * Tạo một bản ghi sổ địa chỉ mới cho người dùng đang đăng nhập hiện tại.
   *
   * @param {number} userId - The authenticated user ID.
   * @param {number} userId - ID người dùng đã xác thực.
   * @param {CreateAddressBookBodyDTO} body - DTO containing address details.
   * @param {CreateAddressBookBodyDTO} body - DTO chứa thông tin chi tiết địa chỉ.
   * @returns The newly created address book entry.
   * @returns Bản ghi sổ địa chỉ mới được tạo.
   */
  @Post('address-book')
  @ZodSerializerDto(AddressBookResDTO)
  createAddressBook(@ActiveUser('userId') userId: number, @Body() body: CreateAddressBookBodyDTO) {
    return this.authService.createAddressBook(userId, body)
  }

  /**
   * Updates an existing address book entry for the currently logged-in user.
   * Cập nhật một bản ghi sổ địa chỉ đang tồn tại của người dùng đang đăng nhập.
   *
   * @param {number} userId - The authenticated user ID.
   * @param {number} userId - ID người dùng đã xác thực.
   * @param {number} id - The ID of the address book entry to update.
   * @param {number} id - ID của bản ghi sổ địa chỉ cần cập nhật.
   * @param {UpdateAddressBookBodyDTO} body - DTO containing updated address fields.
   * @param {UpdateAddressBookBodyDTO} body - DTO chứa các trường địa chỉ cần cập nhật.
   * @returns The updated address book entry.
   * @returns Bản ghi sổ địa chỉ đã cập nhật.
   */
  @Patch('address-book/:id')
  @ZodSerializerDto(AddressBookResDTO)
  updateAddressBook(
    @ActiveUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAddressBookBodyDTO,
  ) {
    return this.authService.updateAddressBook(userId, id, body)
  }

  /**
   * Deletes an address book entry (soft-delete) for the currently logged-in user.
   * Xóa một bản ghi sổ địa chỉ (xóa mềm) đối với người dùng đang đăng nhập.
   *
   * @param {number} userId - The authenticated user ID.
   * @param {number} userId - ID người dùng đã xác thực.
   * @param {number} id - The ID of the address book entry to delete.
   * @param {number} id - ID của bản ghi sổ địa chỉ cần xóa.
   * @returns A success message object.
   * @returns Đối tượng thông điệp thành công.
   */
  @Delete('address-book/:id')
  @ZodSerializerDto(MessageResDTO)
  deleteAddressBook(@ActiveUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.authService.deleteAddressBook(userId, id)
  }

  /**
   * Generates and sends an OTP code to a user's email address.
   * Tạo và gửi mã OTP tới địa chỉ email của người dùng.
   *
   * Rate limited: 1 request per 60 seconds.
   * Giới hạn tần suất: 1 request mỗi 60 giây.
   *
   * @param {SendOPTBodyDTO} body - DTO containing destination email and action type.
   * @param {SendOPTBodyDTO} body - DTO chứa email đích và loại hành động.
   * @returns A success message object.
   * @returns Đối tượng thông điệp thành công.
   */
  @Throttle({
    default: { limit: 1, ttl: 60000 },
  })
  @Post('otp')
  @isPublic()
  async sendOTP(@Body() body: SendOPTBodyDTO) {
    return await this.authService.sendOTP(body)
  }

  /**
   * Verifies an OTP code submitted by the user.
   * Xác thực mã OTP do người dùng cung cấp.
   *
   * @param {VerifyOTPBodyDTO} body - DTO containing email, OTP code, and action type.
   * @param {VerifyOTPBodyDTO} body - DTO chứa email, mã OTP và loại hành động.
   * @returns A success message object.
   * @returns Đối tượng thông điệp thành công.
   */
  @Post('verify-otp')
  @isPublic()
  @ZodSerializerDto(MessageResDTO)
  async verifyOTP(@Body() body: VerifyOTPBodyDTO) {
    return await this.authService.verifyOTP(body)
  }

  /**
   * Registers a new user account after validating the register OTP.
   * Đăng ký một tài khoản người dùng mới sau khi xác thực OTP đăng ký.
   *
   * @param {RegisterBodyDTO} body - DTO containing email, password, profile fields, and OTP code.
   * @param {RegisterBodyDTO} body - DTO chứa email, mật khẩu, thông tin hồ sơ và mã OTP.
   * @returns The registered user profile excluding credentials.
   * @returns Hồ sơ người dùng đã đăng ký không bao gồm thông tin xác thực.
   */
  @Post('register')
  @isPublic()
  @ZodSerializerDto(RegisterResDTO)
  async register(@Body() body: RegisterBodyDTO) {
    return await this.authService.register(body)
  }

  /**
   * Authenticates a user by validating their password and issuing token pairs.
   * Xác thực người dùng bằng cách kiểm tra mật khẩu và cấp cặp token.
   *
   * Rate limited: 5 requests per 60 seconds.
   * Giới hạn tần suất: 5 request mỗi 60 giây.
   *
   * @param {LoginBodyDTO} body - DTO containing email, password, and optional 2FA code.
   * @param {LoginBodyDTO} body - DTO chứa email, mật khẩu và mã 2FA tùy chọn.
   * @param {string} userAgent - The User-Agent string of the client.
   * @param {string} userAgent - Chuỗi User-Agent của client.
   * @param {string} ip - The client's IP address.
   * @param {string} ip - Địa chỉ IP của client.
   * @returns JWT access token and refresh token.
   * @returns Access token và refresh token JWT.
   */
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

  /**
   * Refreshes JWT tokens by validating the submitted refresh token.
   * Làm mới các token JWT bằng cách xác thực refresh token được cung cấp.
   *
   * @param {RefreshTokenBodyDTO} body - DTO containing the active refresh token.
   * @param {RefreshTokenBodyDTO} body - DTO chứa refresh token đang hoạt động.
   * @param {string} userAgent - The User-Agent string.
   * @param {string} userAgent - Chuỗi User-Agent.
   * @param {string} ip - The client's IP.
   * @param {string} ip - Địa chỉ IP của client.
   * @returns A new pair of JWT access and refresh tokens.
   * @returns Cặp token JWT access và refresh mới.
   */
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

  /**
   * De-authenticates a user, blacklisting their refresh token and deactivating the device session.
   * Đăng xuất người dùng, vô hiệu hóa refresh token và hủy hoạt động của phiên thiết bị.
   *
   * @param {RefreshTokenBodyDTO} body - DTO containing the active refresh token to invalidate.
   * @param {RefreshTokenBodyDTO} body - DTO chứa refresh token đang hoạt động để vô hiệu hóa.
   * @returns A success message object.
   * @returns Đối tượng thông điệp thành công.
   */
  @Post('logout')
  @isPublic()
  @HttpCode(200)
  @ZodSerializerDto(MessageResDTO)
  logout(@Body() body: RefreshTokenBodyDTO) {
    return this.authService.logout(body.refreshToken)
  }

  /**
   * Generates a Google OAuth authorization URL for client login redirection.
   * Tạo URL ủy quyền Google OAuth để chuyển hướng đăng nhập của client.
   *
   * @param {string} userAgent - The User-Agent of the client.
   * @param {string} userAgent - User-Agent của client.
   * @param {string} ip - The IP of the client.
   * @param {string} ip - IP của client.
   * @returns {Promise<GetAuthorizationUrlResDTO>} The Google OAuth redirect URL.
   * @returns {Promise<GetAuthorizationUrlResDTO>} URL chuyển hướng Google OAuth.
   */
  @Get('google-link')
  @isPublic()
  @ZodSerializerDto(GetAuthorizationUrlResDTO)
  getAuthorizationUrl(@UserAgent() userAgent: string, @Ip() ip: string) {
    return this.googleService.getAuthorizationUrl({
      userAgent,
      ip,
    })
  }

  /**
   * OAuth Callback endpoint invoked by Google after authentication.
   * Endpoint Callback OAuth được gọi bởi Google sau khi xác thực thành công.
   *
   * Validates OAuth code/state, creates or finds the user, establishes a session, and redirects
   * the client back to the front-end application with the session token.
   * Xác thực mã/state OAuth, tạo hoặc tìm người dùng, thiết lập phiên và chuyển hướng client
   * quay về ứng dụng front-end kèm theo session token.
   */
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
      const message = getGoogleCallbackErrorMessage(error)
      return res.redirect(
        buildGoogleRedirectUrl(envConfig.GOOGLE_CLIENT_REDIRECT_URI, {
          errorMessage: message,
        }),
      )
    }
  }

  /**
   * Redeems a short-lived Google session token for a standard pair of JWT auth tokens.
   * Đổi một session token ngắn hạn của Google lấy cặp token xác thực JWT tiêu chuẩn.
   *
   * @param {GoogleSessionBodyDTO} body - DTO containing the short-lived session token.
   * @param {GoogleSessionBodyDTO} body - DTO chứa session token ngắn hạn.
   * @returns {Promise<GoogleSessionResDTO>} The resolved JWT token pair.
   * @returns {Promise<GoogleSessionResDTO>} Cặp token JWT đã phân giải thành công.
   */
  @Post('google/session')
  @isPublic()
  @ZodSerializerDto(GoogleSessionResDTO)
  exchangeGoogleSession(@Body() body: GoogleSessionBodyDTO) {
    return this.googleService.redeemGoogleSession(body.sessionToken)
  }

  /**
   * Standard forgot password workflow to reset user password via email OTP validation.
   * Luồng quên mật khẩu tiêu chuẩn để đặt lại mật khẩu người dùng qua xác thực email OTP.
   *
   * Rate limited: 3 requests per 15 minutes.
   * Giới hạn tần suất: 3 request mỗi 15 phút.
   *
   * @param {ForgotPasswordBodyDTO} body - DTO containing email, OTP code, and new password.
   * @param {ForgotPasswordBodyDTO} body - DTO chứa email, mã OTP và mật khẩu mới.
   * @returns A success message object.
   * @returns Đối tượng thông điệp thành công.
   */
  @Post('forgot-password')
  @isPublic()
  @Throttle({
    default: { limit: 3, ttl: 900000 },
  })
  @ZodSerializerDto(MessageResDTO)
  forgotPassword(@Body() body: ForgotPasswordBodyDTO) {
    return this.authService.forgotPassword(body)
  }
}
