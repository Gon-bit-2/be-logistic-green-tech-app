import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { v4 as uuidv4 } from 'uuid'

import { StringValue } from 'ms'
import envConfig from 'src/config/config'
import { AccessTokenPayload, IAccessTokenPayload, IRefreshTokenPayload, RefreshTokenPayload } from '../types/jwt.type'

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}
  signAccessToken(payload: IAccessTokenPayload) {
    const accessToken = this.jwtService.signAsync(
      { ...payload, uuid: uuidv4() },
      {
        secret: envConfig.ACCESS_TOKEN_SECRET,
        expiresIn: envConfig.ACCESS_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )

    return accessToken
  }
  signRefreshToken(payload: IRefreshTokenPayload) {
    const refreshToken = this.jwtService.signAsync(
      { ...payload, uuid: uuidv4() },
      {
        secret: envConfig.REFRESH_TOKEN_SECRET,
        expiresIn: envConfig.REFRESH_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )
    return refreshToken
  }
  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.ACCESS_TOKEN_SECRET,
    })
  }
  /**
   *
   * @param refreshToken
   * @returns
   */
  verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.REFRESH_TOKEN_SECRET,
    })
  }
}
