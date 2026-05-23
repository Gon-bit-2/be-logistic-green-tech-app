import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import envConfig from 'src/config/config'
import { GoogleAuthStateType, LoginResType } from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { HashingService } from 'src/common/services/hashing.service'
import { v4 as uuidv4 } from 'uuid'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { RoleRepository } from 'src/modules/role/repository/role.repo'
import type { RoleNameType } from 'src/common/constants/role.constant'

/**
 * Service that handles Google OAuth2 flow and session token management.
 * Service xử lý luồng Google OAuth2 và quản lý session token.
 *
 * Provides methods to generate Google auth links, process callback tokens, register or resolve
 * users from their Google profiles, and exchange session keys for permanent JWT credentials.
 * Cung cấp các phương thức để tạo liên kết đăng nhập Google, xử lý callback token, đăng ký hoặc phân giải
 * người dùng từ hồ sơ Google của họ và đổi khóa phiên lấy thông tin xác thực JWT vĩnh viễn.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name)
  private oauth2Client: OAuth2Client
  private readonly stateCacheTtlMs = 10 * 60 * 1000
  private readonly sessionCacheTtlMs = 60 * 1000

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly roleRepository: RoleRepository,
    private readonly hashService: HashingService,
    private readonly authService: AuthService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      envConfig.GOOGLE_CLIENT_ID,
      envConfig.GOOGLE_CLIENT_SECRET,
      envConfig.GOOGLE_REDIRECT_URI,
    )
  }

  /**
   * Generates the cache key for Google OAuth state verification.
   */
  private getGoogleStateCacheKey(stateToken: string) {
    return `google_oauth:state:${stateToken}`
  }

  /**
   * Generates the cache key for temporary Google login sessions.
   */
  private getGoogleSessionCacheKey(sessionToken: string) {
    return `google_oauth:session:${sessionToken}`
  }

  /**
   * Generates a Google OAuth authorization URL for client redirection.
   * Tạo URL ủy quyền Google OAuth để chuyển hướng client.
   *
   * Stores the unique state token in the cache to validate the callback.
   * Lưu trữ state token duy nhất vào cache để xác thực callback sau đó.
   *
   * @param {GoogleAuthStateType} state - The client context (userAgent, IP).
   * @param {GoogleAuthStateType} state - Ngữ cảnh của client (userAgent, IP).
   * @returns {Promise<{ url: string }>} The generated Google OAuth URL.
   * @returns {Promise<{ url: string }>} URL Google OAuth đã được tạo.
   */
  async getAuthorizationUrl({ userAgent, ip }: GoogleAuthStateType) {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]
    const stateToken = uuidv4()

    await this.cacheManager.set(
      this.getGoogleStateCacheKey(stateToken),
      {
        ip,
        userAgent,
      } satisfies GoogleAuthStateType,
      this.stateCacheTtlMs,
    )

    // generate url
    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      state: stateToken,
    })
    return { url }
  }

  /**
   * Handles Google OAuth callback code and state verification.
   * Xử lý callback của Google OAuth để xác thực code và state.
   *
   * Contacts Google APIs to exchange code for tokens, fetches user profile (email, name, picture),
   * creates user in the database if not exists, registers their device session, and issues a temporary
   * short-lived session token.
   * Liên hệ với Google API để đổi code lấy token, lấy thông tin người dùng (email, name, picture),
   * tạo người dùng trong cơ sở dữ liệu nếu chưa tồn tại, đăng ký phiên thiết bị và cấp session token tạm thời.
   *
   * @param {object} params - State and authorization code from Google.
   * @param {object} params - State và mã ủy quyền từ Google.
   * @returns {Promise<{ sessionToken: string }>} The temporary session token key.
   * @returns {Promise<{ sessionToken: string }>} Khóa session token tạm thời.
   * @throws {UnauthorizedException} If state is invalid or expired.
   * @throws {UnauthorizedException} Nếu state không hợp lệ hoặc đã hết hạn.
   */
  async googleCallback({ state, code }: { state: string; code: string }) {
    try {
      if (!code) {
        throw new Error('Thiếu mã xác thực từ Google')
      }

      if (!state) {
        throw new UnauthorizedException('Google OAuth state không hợp lệ hoặc đã hết hạn')
      }

      const stateCacheKey = this.getGoogleStateCacheKey(state)
      const clientInfo = (await this.cacheManager.get<GoogleAuthStateType>(stateCacheKey)) ?? null

      if (!clientInfo) {
        throw new UnauthorizedException('Google OAuth state không hợp lệ hoặc đã hết hạn')
      }

      await this.cacheManager.del(stateCacheKey)

      const userAgent = clientInfo.userAgent
      const ip = clientInfo.ip
      //2: lấy tokens từ code
      const { tokens } = await this.oauth2Client.getToken(code)
      this.oauth2Client.setCredentials(tokens)
      //3:lấy thông tin gooogle user
      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: 'v2',
      })
      const { data } = await oauth2.userinfo.get()
      if (!data.email) {
        throw new Error('Không thể lấy thông tin người dùng')
      }
      let user = await this.authRepository.findUniqueIncludeRole({
        email: data.email,
      })
      if (!user) {
        const clientRoleId = await this.roleRepository.getClientRoleId()
        const randomPassword = uuidv4()
        const hashPassword = await this.hashService.hash(randomPassword)
        user = await this.authRepository.createUserIncludeRole({
          email: data.email,
          fullName: data.name ?? '',
          password: hashPassword,
          roleId: clientRoleId,
          avatar: data.picture ?? '',
          phone: null,
        })
      }
      const device = await this.authRepository.createDevice({
        userId: user.id,
        userAgent: userAgent,
        ip: ip,
      })
      const authTokens = await this.authService.generateTokens({
        userId: user.id,
        deviceId: device.id,
        roleId: user.roleId,
        roleName: user.role.name as RoleNameType,
      })

      const sessionToken = uuidv4()

      await this.cacheManager.set(this.getGoogleSessionCacheKey(sessionToken), authTokens, this.sessionCacheTtlMs)

      return { sessionToken }
    } catch (error) {
      this.logger.error(
        `Google OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error
    }
  }

  /**
   * Exchanges a temporary session token for standard JWT auth tokens.
   * Đổi một session token tạm thời lấy cặp token xác thực JWT tiêu chuẩn.
   *
   * Destroys the session token in the cache upon redemption to prevent replay attacks.
   * Hủy session token trong cache ngay sau khi đổi để ngăn chặn các cuộc tấn công phát lại (replay attacks).
   *
   * @param {string} sessionToken - The temporary session token key.
   * @param {string} sessionToken - Khóa session token tạm thời.
   * @returns {Promise<LoginResType>} The active JWT access and refresh token pair.
   * @returns {Promise<LoginResType>} Cặp token JWT access và refresh đang hoạt động.
   * @throws {BadRequestException} If session token is invalid or expired.
   * @throws {BadRequestException} Nếu session token không hợp lệ hoặc đã hết hạn.
   */
  async redeemGoogleSession(sessionToken: string): Promise<LoginResType> {
    const sessionCacheKey = this.getGoogleSessionCacheKey(sessionToken)
    const authTokens = (await this.cacheManager.get<LoginResType>(sessionCacheKey)) ?? null

    if (!authTokens) {
      throw new BadRequestException('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn')
    }

    await this.cacheManager.del(sessionCacheKey)

    return authTokens
  }
}
