import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Socket } from 'socket.io'
import envConfig from 'src/config/config'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'

/**
 * WebSocket JWT Guard — Validates JWT token for Socket.IO connections.
 * WebSocket JWT Guard — Xác thực JWT token cho kết nối Socket.IO.
 *
 * Client must send the token via handshake auth:
 *   io('/tracking', { auth: { token: '<accessToken>' } })
 *
 * Client phải gửi token thông qua handshake auth:
 *   io('/tracking', { auth: { token: '<accessToken>' } })
 *
 * The guard decodes the token, assigns the user payload to `socket.data.user`,
 * and rejects the connection if the token is invalid or expired.
 * Guard giải mã token, gán user payload vào socket.data.user
 * và từ chối kết nối nếu token không hợp lệ hoặc hết hạn.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name)

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Main guard handler for WebSocket connection attempts.
   * Trình xử lý guard chính cho các yêu cầu kết nối WebSocket.
   *
   * @param {ExecutionContext} context - The NestJS execution context.
   * @param {ExecutionContext} context - Bối cảnh thực thi của NestJS.
   * @returns {Promise<boolean>} Resolves to true if connection is authorized.
   * @returns {Promise<boolean>} Trả về Promise chứa true nếu kết nối được phép.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lấy client socket từ context WebSocket
    const client = context.switchToWs().getClient<Socket>()
    return this.validateClient(client)
  }

  /**
   * Validates socket client using JWT token from handshake auth.
   * Xác thực socket client bằng JWT token từ handshake auth.
   *
   * Used by both the Guard (canActivate) and handleConnection (manual verification).
   * Dùng cho cả Guard (canActivate) và handleConnection (manual verify).
   *
   * @param {Socket} client - The socket client instance to validate.
   * @param {Socket} client - Socket client cần xác thực.
   * @returns {Promise<boolean>} True if the token is valid, false otherwise.
   * @returns {Promise<boolean>} True nếu token hợp lệ, false nếu không.
   */
  async validateClient(client: Socket): Promise<boolean> {
    const token = this.extractTokenFromHandshake(client)

    if (!token) {
      this.logger.warn(`🚫 WebSocket rejected: No auth token provided | client=${client.id}`)
      return false
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: envConfig.ACCESS_TOKEN_SECRET,
      })

      // Gán user payload vào socket.data để các handler sử dụng sau này
      client.data.user = payload
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`🚫 WebSocket rejected: Invalid token | client=${client.id} | error=${message}`)
      return false
    }
  }

  /**
   * Extracts the JWT token from the handshake auth or query parameters.
   * Trích xuất JWT token từ handshake auth hoặc query params.
   *
   * Supports two methods of sending the token:
   * 1. auth: { token: '...' }      (Recommended - more secure)
   * 2. query: { token: '...' }     (Fallback for older clients)
   *
   * Hỗ trợ 2 cách gửi token từ client:
   * 1. auth: { token: '...' }      (Khuyến nghị — bảo mật hơn)
   * 2. query: { token: '...' }     (Fallback cho các client cũ)
   *
   * @param {Socket} client - The socket client instance.
   * @param {Socket} client - Đối tượng socket client.
   * @returns {string | null} The extracted token string or null if not found.
   * @returns {string | null} Chuỗi token được trích xuất hoặc null nếu không tìm thấy.
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
