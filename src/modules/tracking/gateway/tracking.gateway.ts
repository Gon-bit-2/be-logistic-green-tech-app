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
import { AccessTokenPayload } from 'src/types/jwt.type'
import { OnEvent } from '@nestjs/event-emitter'
import { Auth } from 'src/common/decorators/auth.decorator'
import { AuthType } from 'src/common/constants/auth.constant'

export interface AuthenticatedSocket extends Socket {
  user?: AccessTokenPayload
}

// ===== KẾT NỐI REAL-TIME TRACKING =====
// Cung cấp namespace riêng biệt cho phép theo dõi thời gian thực vị trí tài xế
// Dễ dàng kết nối từ mobile app và web app với kiến trúc Pub/Sub
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'tracking',
})
@Auth(AuthType.None)
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(TrackingGateway.name)

  /**
   * Handle client connections (Tài xế hoặc Khách hàng)
   * Có thể mở rộng để validate JWT token ngay tại đây qua client.handshake.auth
   */
  handleConnection(client: AuthenticatedSocket) {
    client.once('disconnect', (reason) => {
      client.data.disconnectReason = reason
    })

    client.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Socket error from ${client.id}: ${message}`)
    })

    this.logger.log(
      `🔗 Client connected: ${client.id} | namespace=${client.nsp.name} | transport=${client.conn.transport.name} | origin=${client.handshake.headers.origin ?? 'unknown'}`,
    )
  }

  /**
   * Handle client disconnections
   */
  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`❌ Client disconnected: ${client.id} | reason=${String(client.data.disconnectReason ?? 'unknown')}`)
  }

  /**
   * TÀI XẾ (DRIVER) gửi cập nhật vị trí GPS liên tục
   *
   * Payload: { tripId: number, lat: number, lng: number }
   * System sẽ tự động broadcast (Publish) vị trí này cho tất cả những ai đang Subscribe room của tripId đó.
   */
  // @UseGuards(WsGuard) // TODO: Cần implement WsGuard sử dụng TokenService riêng cho WebSocket // Chỉ User đăng nhập mới cho push/pull data
  @SubscribeMessage('driverLocationUpdate')
  handleLocationUpdate(
    @MessageBody() data: { lat: number; lng: number; tripId: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    // 💡 Kiến trúc Clean: Gateway chỉ lo IO, không chứa Business Logic nặng.
    // Nếu cần lưu lịch sử GPS vào Redis/DB thì tiêm TrackingService vào đây.

    // 1. Lấy thông tin user hiện tại từ token đã được Guard giải mã
    const user = client.user

    this.logger.debug(
      `📍 Tài xế (ID: ${user?.userId}) cập nhật GPS chuyến đi #${data.tripId}: [${data.lat}, ${data.lng}]`,
    )

    // 2. Phát lại thông tin vào broadcast room của chuyến đi
    this.server.to(`trip_${data.tripId}`).emit('locationUpdated', {
      driverId: user?.userId,
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
   */
  // @UseGuards(WsGuard) // TODO: Cần implement WsGuard sử dụng TokenService riêng cho WebSocket
  @SubscribeMessage('joinTripTracking')
  handleJoinRoom(@MessageBody() data: { tripId: number }, @ConnectedSocket() client: AuthenticatedSocket) {
    // Cho phép socket tham gia vào Room riêng biệt
    client.join(`trip_${data.tripId}`)
    this.logger.log(`👥 Client ${client.id} joined tracking room: trip_${data.tripId}`)

    return { event: 'joined', message: `Successfully joined trip_${data.tripId}` }
  }

  /**
   * KHÁCH HÀNG rời room tracking (tối ưu bộ nhớ trên Socket server)
   */
  // @UseGuards(WsGuard) // TODO: Cần implement WsGuard sử dụng TokenService riêng cho WebSocket
  @SubscribeMessage('leaveTripTracking')
  handleLeaveRoom(@MessageBody() data: { tripId: number }, @ConnectedSocket() client: AuthenticatedSocket) {
    client.leave(`trip_${data.tripId}`)
    this.logger.log(`🚶‍♂️ Client ${client.id} left tracking room: trip_${data.tripId}`)

    return { event: 'left', message: `Successfully left trip_${data.tripId}` }
  }

  @OnEvent('trip.created')
  handleTripCreatedEvent(payload: { trip: { id: number; [key: string]: any } }) {
    this.logger.log(`🚀 Chuyến xe mới được tạo: Trip ID #${payload.trip?.id}. Đang broadcast tới dashboard...`)
    this.server.emit('dashboard.tripCreated', payload.trip)
  }
}
