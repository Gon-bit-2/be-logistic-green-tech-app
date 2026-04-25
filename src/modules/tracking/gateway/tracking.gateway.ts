import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { OnEvent } from '@nestjs/event-emitter'
import { Auth } from 'src/common/decorators/auth.decorator'
import { AuthType } from 'src/common/constants/auth.constant'
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard'

export interface AuthenticatedSocket extends Socket {
  /** User payload đã được WsJwtGuard giải mã từ JWT token */
  data: Socket['data'] & {
    user?: AccessTokenPayload
    disconnectReason?: string
  }
}

// ===== KẾT NỐI REAL-TIME TRACKING =====
// Cung cấp namespace riêng biệt cho phép theo dõi thời gian thực vị trí tài xế
// Dễ dàng kết nối từ mobile app và web app với kiến trúc Pub/Sub
//
// CORS: Giới hạn origin thay vì cho phép tất cả ('*') để tránh bị exploit
// Authentication: JWT token bắt buộc khi connect qua handshake auth
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:8386',
    ],
    credentials: true,
  },
  namespace: 'tracking',
})
@Auth(AuthType.None) // Bypass HTTP guards vì WebSocket dùng WsJwtGuard riêng
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(TrackingGateway.name)

  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

  /**
   * Handle client connections — BẮT BUỘC xác thực JWT token.
   *
   * Client phải gửi token khi kết nối:
   *   io('/tracking', { auth: { token: accessToken } })
   *
   * Nếu token không hợp lệ hoặc hết hạn, socket sẽ bị disconnect ngay lập tức.
   * Điều này ngăn chặn:
   *   - Kẻ tấn công gửi fake GPS data giả mạo tài xế
   *   - Người lạ join tracking room để theo dõi vị trí trái phép
   *   - Spam fake location updates gây nhiễu hệ thống
   */
  async handleConnection(client: AuthenticatedSocket) {
    // Xác thực JWT token từ handshake auth
    const isAuthenticated = await this.wsJwtGuard.validateClient(client)

    if (!isAuthenticated) {
      this.logger.warn(
        `🚫 Rejected unauthenticated WebSocket connection: ${client.id} | origin=${client.handshake.headers.origin ?? 'unknown'}`,
      )
      client.emit('exception', {
        statusCode: 401,
        message: 'Authentication required. Please provide a valid token via auth.token.',
        timestamp: new Date().toISOString(),
      })
      client.disconnect(true)
      return
    }

    // Đăng ký event handlers cho connection lifecycle
    client.once('disconnect', (reason) => {
      client.data.disconnectReason = reason
    })

    client.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Socket error from ${client.id}: ${message}`)
    })

    const user = client.data.user
    this.logger.log(
      `🔗 Client connected: ${client.id} | userId=${user?.userId} | role=${user?.roleName} | transport=${client.conn.transport.name}`,
    )
  }

  /**
   * Handle client disconnections
   */
  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user
    this.logger.log(
      `❌ Client disconnected: ${client.id} | userId=${user?.userId ?? 'unknown'} | reason=${String(client.data.disconnectReason ?? 'unknown')}`,
    )
  }

  /**
   * TÀI XẾ (DRIVER) gửi cập nhật vị trí GPS liên tục
   *
   * Payload: { tripId: number, lat: number, lng: number }
   * System sẽ tự động broadcast (Publish) vị trí này cho tất cả những ai đang Subscribe room của tripId đó.
   *
   * Bảo mật: Chỉ user đã xác thực mới có thể gửi location update.
   * User info được lấy từ socket.data.user (đã verify ở handleConnection).
   */
  @SubscribeMessage('driverLocationUpdate')
  handleLocationUpdate(
    @MessageBody() data: { lat: number; lng: number; tripId: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    // Kiểm tra user đã được xác thực (phòng trường hợp race condition)
    const user = client.data.user
    if (!user) {
      return { status: 'error', message: 'Unauthorized' }
    }

    this.logger.debug(
      `📍 Tài xế (ID: ${user.userId}) cập nhật GPS chuyến đi #${data.tripId}: [${data.lat}, ${data.lng}]`,
    )

    // Phát lại thông tin vào broadcast room của chuyến đi
    this.server.to(`trip_${data.tripId}`).emit('locationUpdated', {
      driverId: user.userId,
      tripId: data.tripId,
      lat: data.lat,
      lng: data.lng,
      timestamp: new Date().toISOString(),
    })

    // Feedback lại cho tài xế là đã nhận (Acknowledge)
    return { status: 'success' }
  }

  /**
   * KHÁCH HÀNG (CUSTOMER) tham gia room để nhận live tracking
   *
   * Bảo mật: Chỉ user đã xác thực mới join được room.
   */
  @SubscribeMessage('joinTripTracking')
  handleJoinRoom(@MessageBody() data: { tripId: number }, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user
    if (!user) {
      return { event: 'error', message: 'Unauthorized' }
    }

    // Cho phép socket tham gia vào Room riêng biệt
    client.join(`trip_${data.tripId}`)
    this.logger.log(`👥 Client ${client.id} (userId=${user.userId}) joined tracking room: trip_${data.tripId}`)

    return { event: 'joined', message: `Successfully joined trip_${data.tripId}` }
  }

  /**
   * KHÁCH HÀNG rời room tracking (tối ưu bộ nhớ trên Socket server)
   */
  @SubscribeMessage('leaveTripTracking')
  handleLeaveRoom(@MessageBody() data: { tripId: number }, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user
    if (!user) {
      return { event: 'error', message: 'Unauthorized' }
    }

    client.leave(`trip_${data.tripId}`)
    this.logger.log(`🚶‍♂️ Client ${client.id} (userId=${user.userId}) left tracking room: trip_${data.tripId}`)

    return { event: 'left', message: `Successfully left trip_${data.tripId}` }
  }

  @OnEvent('trip.created')
  handleTripCreatedEvent(payload: { trip: { id: number; [key: string]: any } }) {
    this.logger.log(`🚀 Chuyến xe mới được tạo: Trip ID #${payload.trip?.id}. Đang broadcast tới dashboard...`)
    this.server.emit('dashboard.tripCreated', payload.trip)
  }
}
