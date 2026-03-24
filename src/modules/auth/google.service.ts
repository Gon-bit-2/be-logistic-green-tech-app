import { Injectable } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import envConfig from 'src/shared/config'
import { GoogleAuthStateType } from './auth.model'
import { AuthRepository } from './repository/auth.repository'
import { HashingService } from 'src/shared/service/hashing.service'
import { v4 as uuidv4 } from 'uuid'
import { TokenService } from 'src/shared/service/token.service'
import { AuthService } from './auth.service'
import { SharedRoleRepository } from 'src/shared/repositories/shared-role.repo'

@Injectable()
export class GoogleService {
  private oauth2Client: OAuth2Client
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly sharedRoleRepository: SharedRoleRepository,
    private readonly hashService: HashingService,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      envConfig.GOOGLE_CLIENT_ID,
      envConfig.GOOGLE_CLIENT_SECRET,
      envConfig.GOOGLE_REDIRECT_URI,
    )
  }
  getAuthorizationUrl({ userAgent, ip }: GoogleAuthStateType) {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]
    // chuyển sang base64
    const stateString = Buffer.from(
      JSON.stringify({
        userAgent,
        ip,
      }),
    ).toString('base64')
    // generate url
    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      state: stateString,
    })
    return { url }
  }
  async googleCallback({ state, code }: { state: string; code: string }) {
    try {
      let userAgent = 'Unknown'
      let ip = 'Unknown'
      //1: lấy state từ url
      try {
        if (state) {
          const clientInfo = JSON.parse(Buffer.from(state, 'base64').toString()) as GoogleAuthStateType
          userAgent = clientInfo.userAgent
          ip = clientInfo.ip
        }
      } catch (error) {
        console.log('Error parsing state', error)
      }
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
          name: data.name ?? '',
          password: hashPassword,
          roleId: clientRoleId,
          avatar: data.picture ?? '',
          phoneNumber: null,
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
      return authTokens
    } catch (error) {
      console.log(error)
      throw error
    }
  }
}
