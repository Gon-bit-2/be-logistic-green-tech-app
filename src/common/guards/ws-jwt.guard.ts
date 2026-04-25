import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Socket } from 'socket.io'
import envConfig from 'src/config/config'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'

/**
 * WebSocket JWT Guard — Xác thực JWT token cho kết nối Socket.IO.
 *
 * Client phải gửi token thông qua handshake auth:
 *   io('/tracking', { auth: { token: '<accessToken>' } })
 *
 * Guard giải mã token, gán user payload vào socket.data.user
 * và từ chối kết nối nếu token không hợp lệ hoặc hết hạn.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name)

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lấy client socket từ context WebSocket
    const client = context.switchToWs().getClient<Socket>()
    return this.validateClient(client)
  }

  /**
   * Xác thực socket client bằng JWT token từ handshake auth.
   * Dùng cho cả Guard (canActivate) và handleConnection (manual verify).
   *
   * @param client - Socket client cần xác thực
   * @returns true nếu token hợp lệ, false nếu không
   */
  async validateClient(client: Socket): Promise<boolean> {
    const token = this.extractTokenFromHandshake(client)

    if (!token) {
      this.logger.warn(
        `🚫 WebSocket rejected: No auth token provided | client=${client.id}`,
      )
      return false
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: envConfig.ACCESS_TOKEN_SECRET },
      )

      // Gán user payload vào socket.data để các handler sử dụng sau này
      client.data.user = payload
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `🚫 WebSocket rejected: Invalid token | client=${client.id} | error=${message}`,
      )
      return false
    }
  }

  /**
   * Trích xuất JWT token từ handshake auth hoặc query params.
   * Hỗ trợ 2 cách gửi token từ client:
   *   1. auth: { token: '...' }       (khuyến nghị — bảo mật hơn)
   *   2. query: { token: '...' }      (fallback cho các client cũ)
   */
  private extractTokenFromHandshake(client: Socket): string | null {
    // Ưu tiên lấy từ auth object (cách chuẩn của Socket.IO v4+)
    const authToken = client.handshake?.auth?.token as string | undefined

    if (authToken && typeof authToken === 'string') {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken
    }

    // Fallback: lấy từ query params (cho mobile hoặc client cũ)
    const queryToken = client.handshake?.query?.token as string | undefined

    if (queryToken && typeof queryToken === 'string') {
      return queryToken.startsWith('Bearer ') ? queryToken.slice(7) : queryToken
    }

    return null
  }
}
