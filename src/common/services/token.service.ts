import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { v4 as uuidv4 } from 'uuid'

import { StringValue } from 'ms'
import envConfig from 'src/config/config'
import { AccessTokenPayload, IAccessTokenPayload, IRefreshTokenPayload, RefreshTokenPayload } from '../types/jwt.type'

/**
 * Service that handles JSON Web Token (JWT) generation and verification.
 * Service xử lý việc tạo và xác thực JSON Web Token (JWT).
 *
 * Provides operations to issue and verify access tokens and refresh tokens using HM-SHA256.
 * Cung cấp các thao tác để cấp phát và xác minh access token và refresh token sử dụng thuật toán HM-SHA256.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Signs and generates a new JWT access token.
   * Ký và tạo mới một JWT access token.
   *
   * @param {IAccessTokenPayload} payload - The user identity details to embed in the token.
   * @param {IAccessTokenPayload} payload - Thông tin định danh người dùng cần nhúng vào token.
   * @returns {Promise<string>} The generated JWT access token string.
   * @returns {Promise<string>} Chuỗi JWT access token đã tạo.
   */
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

  /**
   * Signs and generates a new JWT refresh token.
   * Ký và tạo mới một JWT refresh token.
   *
   * @param {IRefreshTokenPayload} payload - The user identity details to embed in the token.
   * @param {IRefreshTokenPayload} payload - Thông tin định danh người dùng cần nhúng vào token.
   * @returns {Promise<string>} The generated JWT refresh token string.
   * @returns {Promise<string>} Chuỗi JWT refresh token đã tạo.
   */
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

  /**
   * Verifies and decodes a JWT access token.
   * Xác minh và giải mã một JWT access token.
   *
   * @param {string} token - The raw access token string to verify.
   * @param {string} token - Chuỗi access token thô cần xác minh.
   * @returns {Promise<AccessTokenPayload>} The decoded token payload if valid.
   * @returns {Promise<AccessTokenPayload>} Payload token đã giải mã nếu hợp lệ.
   */
  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.ACCESS_TOKEN_SECRET,
    })
  }

  /**
   * Verifies and decodes a JWT refresh token.
   * Xác minh và giải mã một JWT refresh token.
   *
   * @param {string} token - The raw refresh token string to verify.
   * @param {string} token - Chuỗi refresh token thô cần xác minh.
   * @returns {Promise<RefreshTokenPayload>} The decoded token payload if valid.
   * @returns {Promise<RefreshTokenPayload>} Payload token đã giải mã nếu hợp lệ.
   */
  verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.REFRESH_TOKEN_SECRET,
    })
  }
}
