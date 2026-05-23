import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { addMilliseconds } from 'date-fns'
import { createHash } from 'node:crypto'
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
import ms, { StringValue } from 'ms'
// import { EmailService } from 'src/shared/service/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { TypeOfVerificationCode, TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { generateOTP } from 'src/common/utils/helpers'
import envConfig from 'src/config/config'
import { EmailService } from 'src/common/services/email.service'
import { IAccessTokenPayload } from 'src/common/types/jwt.type'
import type { RoleNameType } from 'src/common/constants/role.constant'
import { RoleRepository } from 'src/modules/role/repository/role.repo'
/**
 * Service that handles core authentication business logic.
 * Service xử lý logic nghiệp vụ xác thực cốt lõi.
 *
 * Manages user profiles, address books, registration, OTP generation/validation,
 * login, session tokens, refresh tokens, logout, and password recovery.
 * Quản lý hồ sơ người dùng, sổ địa chỉ, đăng ký, tạo/xác thực OTP,
 * đăng nhập, token phiên, refresh token, đăng xuất và khôi phục mật khẩu.
 */
@Injectable()
export class AuthService {
  private static readonly DUMMY_PASSWORD_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOeFKb1YI7DiIP9N6byN1Nsx3Rp3XIanG'
  private static readonly INVALID_LOGIN_MESSAGE = 'Email hoặc mật khẩu không chính xác'
  private static readonly INVALID_FORGOT_PASSWORD_MESSAGE = 'Thông tin đặt lại mật khẩu không hợp lệ'

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly hashingService: HashingService,
    private readonly authRepository: AuthRepository,
    private readonly verificationCodeRepository: VerificationCodeRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Helper to build a cache key for 2FA pending secrets.
   * Phương thức bổ trợ xây dựng cache key cho khóa bí mật 2FA đang chờ xử lý.
   */
  private getTwoFactorPendingSecretCacheKey(userId: number) {
    return `2fa:pending:${userId}`
  }

  /**
   * Helper to create a SHA256 hash of a refresh token.
   * Phương thức bổ trợ tạo mã băm SHA256 cho refresh token.
   */
  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex')
  }

  /**
   * Helper to construct a standard invalid login exception.
   * Phương thức bổ trợ xây dựng ngoại lệ đăng nhập không hợp lệ tiêu chuẩn.
   */
  private buildInvalidLoginException() {
    return new UnprocessableEntityException([
      {
        message: AuthService.INVALID_LOGIN_MESSAGE,
        path: 'email',
      },
    ])
  }

  /**
   * Helper to construct a standard invalid forgot password exception.
   * Phương thức bổ trợ xây dựng ngoại lệ quên mật khẩu không hợp lệ tiêu chuẩn.
   */
  private buildInvalidForgotPasswordException() {
    return new UnprocessableEntityException([
      {
        message: AuthService.INVALID_FORGOT_PASSWORD_MESSAGE,
        path: 'email',
      },
    ])
  }

  /**
   * Type guard to check if an error object contains a code property.
   * Kiểm tra xem đối tượng lỗi có chứa thuộc tính code hay không.
   */
  private hasErrorCode(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  }

  /**
   * Retrieves profile details of an active user.
   * Lấy thông tin chi tiết hồ sơ của một người dùng đang hoạt động.
   *
   * @param {number} userId - The active user's ID.
   * @param {number} userId - ID của người dùng đang hoạt động.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} Profile information without sensitive fields.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} Thông tin hồ sơ không bao gồm các trường nhạy cảm.
   * @throws {UnauthorizedException} If user is not found.
   * @throws {UnauthorizedException} Nếu không tìm thấy người dùng.
   */
  async getProfile(userId: number) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = user
    return profile
  }

  /**
   * Updates profile fields of an active user.
   * Cập nhật các trường hồ sơ của một người dùng đang hoạt động.
   *
   * @param {number} userId - The active user's ID.
   * @param {number} userId - ID của người dùng đang hoạt động.
   * @param {UpdateProfileBodyType} body - The updated profile details.
   * @param {UpdateProfileBodyType} body - Chi tiết hồ sơ cần cập nhật.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} Updated user profile.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} Hồ sơ người dùng đã cập nhật.
   * @throws {UnauthorizedException} If user is not found.
   * @throws {UnauthorizedException} Nếu không tìm thấy người dùng.
   */
  async updateProfile(userId: number, body: UpdateProfileBodyType) {
    const user = await this.authRepository.findUnique({ id: userId })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const updatedUser = await this.authRepository.update(
      { id: userId },
      {
        ...body,
        updatedById: userId,
      },
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, totpSecret, ...profile } = updatedUser
    return profile
  }

  /**
   * Retrieves address book records of a user.
   * Lấy danh sách các bản ghi sổ địa chỉ của một người dùng.
   *
   * @param {number} userId - The target user's ID.
   * @param {number} userId - ID của người dùng mục tiêu.
   * @returns {Promise<{ data: AddressBook[] }>} The user's address book entries.
   * @returns {Promise<{ data: AddressBook[] }>} Các bản ghi sổ địa chỉ của người dùng.
   */
  async getAddressBooks(userId: number) {
    const data = await this.authRepository.findAddressBooksByUserId(userId)
    return { data }
  }

  /**
   * Creates a new address book entry for a user.
   * Tạo một bản ghi sổ địa chỉ mới cho người dùng.
   *
   * Handles auto-setting default flags if it is the first address.
   * Tự động thiết lập cờ mặc định nếu đây là địa chỉ đầu tiên.
   *
   * @param {number} userId - The user's ID.
   * @param {number} userId - ID của người dùng.
   * @param {CreateAddressBookBodyType} body - Details of the new address book.
   * @param {CreateAddressBookBodyType} body - Chi tiết của sổ địa chỉ mới.
   * @returns {Promise<AddressBook>} The newly created address book entry.
   * @returns {Promise<AddressBook>} Bản ghi sổ địa chỉ mới được tạo.
   */
  async createAddressBook(userId: number, body: CreateAddressBookBodyType) {
    const totalItems = await this.authRepository.countActiveAddressBooksByUserId(userId)
    const isDefault = body.isDefault ?? totalItems === 0

    return await this.prismaService.$transaction(async (tx) => {
      if (isDefault) {
        await this.authRepository.clearDefaultAddressBooks(userId, undefined, tx)
      }

      return await this.authRepository.createAddressBook(
        {
          ...body,
          userId,
          isDefault,
        },
        tx,
      )
    })
  }

  /**
   * Updates an existing address book entry for a user.
   * Cập nhật một bản ghi sổ địa chỉ hiện có của người dùng.
   *
   * Manages clearing of other default addresses if the current is set to default.
   * Quản lý việc xóa cờ mặc định của các địa chỉ khác nếu địa chỉ này được đặt làm mặc định.
   *
   * @param {number} userId - The user's ID.
   * @param {number} userId - ID của người dùng.
   * @param {number} addressBookId - The address book entry ID.
   * @param {number} addressBookId - ID của bản ghi sổ địa chỉ.
   * @param {UpdateAddressBookBodyType} body - Updated address book fields.
   * @param {UpdateAddressBookBodyType} body - Các trường sổ địa chỉ cần cập nhật.
   * @returns {Promise<AddressBook>} The updated address book entry.
   * @returns {Promise<AddressBook>} Bản ghi sổ địa chỉ đã được cập nhật.
   * @throws {NotFoundException} If the address book entry is not found.
   * @throws {NotFoundException} Nếu không tìm thấy bản ghi sổ địa chỉ.
   */
  async updateAddressBook(userId: number, addressBookId: number, body: UpdateAddressBookBodyType) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    return await this.prismaService.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await this.authRepository.clearDefaultAddressBooks(userId, addressBookId, tx)
      }

      return await this.authRepository.updateAddressBook(
        addressBookId,
        {
          ...body,
          ...(body.label !== undefined ? { label: body.label ?? null } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude ?? null } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude ?? null } : {}),
        },
        tx,
      )
    })
  }

  /**
   * Performs soft deletion on an address book entry.
   * Thực hiện xóa mềm một bản ghi sổ địa chỉ.
   *
   * Handles fallback designation for active defaults if the deleted address was primary.
   * Tự động gán địa chỉ mặc định dự phòng nếu địa chỉ bị xóa đang là mặc định chính.
   *
   * @param {number} userId - The user's ID.
   * @param {number} userId - ID của người dùng.
   * @param {number} addressBookId - The ID of target entry.
   * @param {number} addressBookId - ID của bản ghi mục tiêu.
   * @returns {Promise<{ message: string }>} A success message object.
   * @returns {Promise<{ message: string }>} Đối tượng thông điệp thành công.
   * @throws {NotFoundException} If target entry does not exist.
   * @throws {NotFoundException} Nếu bản ghi mục tiêu không tồn tại.
   */
  async deleteAddressBook(userId: number, addressBookId: number) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    await this.prismaService.$transaction(async (tx) => {
      await this.authRepository.updateAddressBook(
        addressBookId,
        {
          deletedAt: new Date(),
          isDefault: false,
        },
        tx,
      )

      if (existingAddress.isDefault) {
        const fallbackAddress = await this.authRepository.findFirstActiveAddressBookByUserId(userId, tx)
        if (fallbackAddress) {
          await this.authRepository.updateAddressBook(
            fallbackAddress.id,
            {
              isDefault: true,
            },
            tx,
          )
        }
      }
    })

    return {
      message: 'Xóa địa chỉ thành công',
    }
  }

  /**
   * Registers a new user account after validating the register OTP.
   * Đăng ký tài khoản người dùng mới sau khi xác thực OTP đăng ký thành công.
   *
   * Assigns default client roles, hashes passwords, and clears the OTP record.
   * Gán vai trò client mặc định, băm mật khẩu và dọn dẹp bản ghi OTP.
   *
   * @param {RegisterBodyType} body - User details and OTP register token.
   * @param {RegisterBodyType} body - Thông tin người dùng và mã OTP đăng ký.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} The newly created user.
   * @returns {Promise<Omit<User, 'password' | 'totpSecret'>>} Người dùng mới được tạo.
   * @throws {BadRequestException} If the user already exists.
   * @throws {BadRequestException} Nếu người dùng đã tồn tại.
   */
  async register(body: RegisterBodyType) {
    try {
      await this.validateVerificationCode({
        email: body.email,
        code: body.code,
        type: TypeOfVerificationCode.REGISTER,
      })
      const clientRoleId = await this.roleRepository.getClientRoleId()
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
      if (this.hasErrorCode(error) && error.code === 'P2002') {
        throw new BadRequestException('Người Dùng Đã Tồn Tại')
      }
      throw error
    }
  }

  /**
   * Generates and transmits a short-lived OTP to a user's email.
   * Tạo và gửi mã OTP ngắn hạn tới email của người dùng.
   *
   * Throws if the email is already in use for registration or returns generic success on forgot password.
   * Trả về lỗi nếu email đã tồn tại khi đăng ký, hoặc phản hồi thành công chung đối với luồng quên mật khẩu.
   *
   * @param {SendOTPBodyType} body - Destination email and action workflow.
   * @param {SendOTPBodyType} body - Email đích và quy trình hành động.
   * @returns {Promise<{ message: string }>} A success confirmation message.
   * @returns {Promise<{ message: string }>} Thông điệp xác nhận thành công.
   * @throws {UnprocessableEntityException} If email is registered (for register flow) or SMTP fails.
   * @throws {UnprocessableEntityException} Nếu email đã được đăng ký (cho luồng đăng ký) hoặc SMTP lỗi.
   */
  async sendOTP(body: SendOTPBodyType) {
    //1:check email exists
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

  /**
   * Validates a submitted OTP without deleting it.
   * Xác thực mã OTP được gửi lên mà không xóa nó khỏi hệ thống.
   *
   * @param {VerifyOTPBodyType} body - Email, code, and workflow type.
   * @param {VerifyOTPBodyType} body - Email, mã code và loại quy trình.
   * @returns {Promise<{ message: string }>} A validity confirmation message.
   * @returns {Promise<{ message: string }>} Thông điệp xác nhận tính hợp lệ.
   */
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

  /**
   * Internal validator to verify active OTP constraints.
   * Bộ xác thực nội bộ để kiểm tra các ràng buộc OTP đang hoạt động.
   *
   * Checks existence and expiration status of the validation record.
   * Kiểm tra sự tồn tại và trạng thái hết hạn của bản ghi xác thực.
   *
   * @param {object} params - Input containing email, code, and type.
   * @param {object} params - Tham số đầu vào chứa email, code và loại OTP.
   * @returns {Promise<VerificationCode>} The valid verification code record.
   * @returns {Promise<VerificationCode>} Bản ghi mã xác thực hợp lệ.
   * @throws {UnprocessableEntityException} If code is invalid or has expired.
   * @throws {UnprocessableEntityException} Nếu mã không hợp lệ hoặc đã hết hạn.
   */
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
  /**
   * Authenticates user, registers device footprint, and issues a standard token pair.
   * Xác thực người dùng, đăng ký dấu vết thiết bị và cấp cặp token tiêu chuẩn.
   *
   * Validates passwords securely and processes secondary factors if MFA/2FA is enabled.
   * Xác thực mật khẩu an toàn và xử lý nhân tố phụ nếu MFA/2FA được bật.
   *
   * @param {LoginBodyType & { userAgent: string; ip: string }} body - Login credentials and device details.
   * @param {LoginBodyType & { userAgent: string; ip: string }} body - Thông tin đăng nhập và thông tin chi tiết thiết bị.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Active JWT session tokens.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Các token phiên JWT hoạt động.
   * @throws {UnprocessableEntityException} If credentials fail or 2FA code is missing/invalid.
   * @throws {UnprocessableEntityException} Nếu thông tin sai hoặc thiếu/sai mã 2FA.
   */
  async login(body: LoginBodyType & { userAgent: string; ip: string }) {
    const user = await this.authRepository.findUniqueIncludeRole({
      email: body.email,
    })
    if (!user) {
      await this.hashingService.compare(body.password, AuthService.DUMMY_PASSWORD_HASH)
      throw this.buildInvalidLoginException()
    }
    const isMatchPassword = await this.hashingService.compare(body.password, user.password)
    if (!isMatchPassword) {
      throw this.buildInvalidLoginException()
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
      roleName: user.role.name as RoleNameType,
      hubId: user.hubId ?? null,
    })
    return tokens
  }

  /**
   * Generates active JWT access/refresh token pairs and commits hash to database.
   * Tạo cặp token JWT access/refresh hoạt động và lưu mã băm vào cơ sở dữ liệu.
   *
   * @param {IAccessTokenPayload} payload - Target roles and context parameters.
   * @param {IAccessTokenPayload} payload - Vai trò đích và các tham số ngữ cảnh.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Signed JWT strings.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Chuỗi JWT đã ký.
   */
  async generateTokens({ userId, deviceId, roleId, roleName, hubId }: IAccessTokenPayload) {
    const resolvedHubId =
      hubId !== undefined ? hubId : ((await this.authRepository.findUnique({ id: userId }))?.hubId ?? null)

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({ userId, deviceId, roleId, roleName, hubId: resolvedHubId }),
      this.tokenService.signRefreshToken({ userId }),
    ])
    //
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)
    await this.authRepository.createRefreshToken({
      tokenHash: this.hashRefreshToken(refreshToken),
      userId,
      expiresAt: new Date(decodedRefreshToken.exp * 1000),
      deviceId,
    })
    return { accessToken, refreshToken }
  }

  /**
   * Validates refresh token and issues a new set of access/refresh tokens.
   * Xác thực refresh token và cấp một bộ token access/refresh mới.
   *
   * Utilizes database verification to enforce single-use refresh token constraints.
   * Sử dụng kiểm tra CSDL để áp đặt ràng buộc sử dụng một lần đối với refresh token.
   *
   * @param {RefreshTokenBodyType & { userAgent: string; ip: string }} input - Active refresh token and device context.
   * @param {RefreshTokenBodyType & { userAgent: string; ip: string }} input - Refresh token hoạt động và ngữ cảnh thiết bị.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Renewed token pair.
   * @returns {Promise<{ accessToken: string; refreshToken: string }>} Cặp token mới được cấp.
   * @throws {UnauthorizedException} If token is inactive or has been reused.
   * @throws {UnauthorizedException} Nếu token không hoạt động hoặc đã được sử dụng lại.
   */
  async refreshToken({ refreshToken, userAgent, ip }: RefreshTokenBodyType & { userAgent: string; ip: string }) {
    //1 check token hợp lệ
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)
    const refreshTokenHash = this.hashRefreshToken(refreshToken)
    const refreshTokenCandidates = [refreshTokenHash, refreshToken]
    //2 check refreshtoken exist
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
    // 3. Chuẩn bị token mới (chỉ xử lý logic JWT, không ghi CSDL)
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

    // 4. Chạy Transaction đảm bảo tính toàn vẹn dữ liệu
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

  /**
   * Logs out the user by blacklisting the refresh token and deactivating the device session.
   * Đăng xuất người dùng bằng cách vô hiệu hóa refresh token và hủy hoạt động phiên thiết bị.
   *
   * @param {string} refreshToken - The active refresh token.
   * @param {string} refreshToken - Refresh token hoạt động.
   * @returns {Promise<{ message: string }>} Success message.
   * @returns {Promise<{ message: string }>} Thông điệp thành công.
   */
  async logout(refreshToken: string) {
    try {
      //1. verify refreshtoken
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

      //2. delete token
      const deleteToken = await this.authRepository.deleteRefreshToken({
        tokenHash: storedRefreshToken.token,
      })

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

  /**
   * Completes forgotten password recovery using verified email OTP validation.
   * Hoàn tất khôi phục mật khẩu quên bằng cách xác thực email OTP đã được xác minh.
   *
   * Hashes the new password and deletes the OTP code within a transactional boundary.
   * Băm mật khẩu mới và xóa mã OTP trong một giao dịch an toàn.
   *
   * @param {ForgotPasswordBodyType} body - Recovery details.
   * @param {ForgotPasswordBodyType} body - Thông tin chi tiết khôi phục.
   * @returns {Promise<{ message: string }>} Success message.
   * @returns {Promise<{ message: string }>} Thông điệp thành công.
   */
  async forgotPassword(body: ForgotPasswordBodyType) {
    const { email, code, newPassword } = body
    const user = await this.authRepository.findUnique({ email })

    try {
      await this.validateVerificationCode({
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
