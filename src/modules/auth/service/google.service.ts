import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import envConfig from 'src/config/config'
import { GoogleAuthStateType, LoginResType } from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { HashingService } from 'src/common/services/hashing.service'
import { v4 as uuidv4 } from 'uuid'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'

@Injectable()
export class GoogleService {
  private oauth2Client: OAuth2Client
  private readonly stateCacheTtlMs = 10 * 60 * 1000
  private readonly sessionCacheTtlMs = 60 * 1000

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly sharedRoleRepository: SharedRoleRepository,
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

  private getGoogleStateCacheKey(stateToken: string) {
    return `google_oauth:state:${stateToken}`
  }

  private getGoogleSessionCacheKey(sessionToken: string) {
    return `google_oauth:session:${sessionToken}`
  }

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
        const clientRoleId = await this.sharedRoleRepository.getClientRoleId()
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
        roleName: user.role.name,
      })

      const sessionToken = uuidv4()

      await this.cacheManager.set(this.getGoogleSessionCacheKey(sessionToken), authTokens, this.sessionCacheTtlMs)

      return { sessionToken }
    } catch (error) {
      console.log(error)
      throw error
    }
  }

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
