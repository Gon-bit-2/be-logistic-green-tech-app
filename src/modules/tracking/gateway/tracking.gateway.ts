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
import envConfig from 'src/config/config'
import { parseCorsOrigins } from 'src/common/utils/cors.util'
import roleName from 'src/common/constants/role.constant'
import { TrackingAccessService } from '../service/tracking-access.service'
import z from 'zod'

type AuthenticatedSocketData = {
  user?: AccessTokenPayload
  disconnectReason?: string
}

export interface AuthenticatedSocket extends Socket {
  /** User payload đã được WsJwtGuard giải mã từ JWT token */
  data: AuthenticatedSocketData
}

// ===== ZOD SCHEMAS CHO WS MESSAGE VALIDATION =====
// Validate input trước khi xử lý để tránh injection hoặc dữ liệu rác

/** Schema validate cho message joinTripTracking / leaveTripTracking */
const TripRoomSchema = z.object({
  tripId: z.number().int().positive('tripId phải là số nguyên dương'),
})

/** Schema validate cho message driverLocationUpdate */
const DriverLocationSchema = z.object({
  tripId: z.number().int().positive('tripId phải là số nguyên dương'),
  lat: z.number().min(-90).max(90, 'lat phải nằm trong [-90, 90]'),
  lng: z.number().min(-180).max(180, 'lng phải nằm trong [-180, 180]'),
})

// ===== KẾT NỐI REAL-TIME TRACKING =====
// Cung cấp namespace riêng biệt cho phép theo dõi thời gian thực vị trí tài xế
// Dễ dàng kết nối từ mobile app và web app với kiến trúc Pub/Sub
//
// CORS: Giới hạn origin thay vì cho phép tất cả ('*') để tránh bị exploit
// Authentication: JWT token bắt buộc khi connect qua handshake auth
@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(envConfig.CORS_ORIGINS) ?? ['http://localhost:3000'],
    credentials: true,
  },
  namespace: 'tracking',
})
@Auth(AuthType.None) // Bypass HTTP guards vì WebSocket dùng WsJwtGuard riêng
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(TrackingGateway.name)
  private readonly tripAccessCache = new Map<string, { expiresAt: number; hasAccess: boolean }>()
  private readonly tripAccessCacheTtlMs = Number(process.env.TRACKING_ACCESS_CACHE_TTL_MS ?? 15_000)

  constructor(
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly trackingAccessService: TrackingAccessService,
  ) {}

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
   * Kiểm tra quyền truy cập Trip theo role:
   * - ADMIN: được xem tất cả trips
   * - WAREHOUSE_STAFF: chỉ xem trip thuộc hub của mình
   * - DRIVER: chỉ xem trip mình đang lái
   * - CUSTOMER: chỉ xem trip chứa đơn hàng của mình
   */
  private async verifyTripAccess(user: AccessTokenPayload, tripId: number): Promise<boolean> {
    const cacheKey = `${user.userId}:${user.roleName}:${tripId}`
    const cached = this.tripAccessCache.get(cacheKey)
    const now = Date.now()

    if (cached && cached.expiresAt > now) {
      return cached.hasAccess
    }

    try {
      await this.trackingAccessService.assertCanJoinTripTracking(user, tripId)
      this.tripAccessCache.set(cacheKey, { expiresAt: now + this.tripAccessCacheTtlMs, hasAccess: true })
      return true
    } catch {
      this.tripAccessCache.set(cacheKey, { expiresAt: now + this.tripAccessCacheTtlMs, hasAccess: false })
      return false
    }
  }

  /**
   * TÀI XẾ (DRIVER) gửi cập nhật vị trí GPS liên tục
   *
   * Payload: { tripId: number, lat: number, lng: number }
   * System sẽ tự động broadcast (Publish) vị trí này cho tất cả những ai đang Subscribe room của tripId đó.
   *
   * Bảo mật:
   * - Validate input (lat/lng range, tripId > 0) bằng Zod
   * - Chỉ DRIVER đúng chuyến mới được gửi location update
   * - Ngăn Driver A giả mạo GPS cho trip của Driver B
   */
  @SubscribeMessage('driverLocationUpdate')
  async handleLocationUpdate(
    @MessageBody() data: { lat: number; lng: number; tripId: number },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    // Kiểm tra user đã được xác thực (phòng trường hợp race condition)
    const user = client.data.user
    if (!user) {
      return { status: 'error', message: 'Unauthorized' }
    }

    // Validate input bằng Zod schema
    const parsed = DriverLocationSchema.safeParse(data)
    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Dữ liệu không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      }
    }

    // Chỉ DRIVER mới được gửi location update
    if (user.roleName !== roleName.DRIVER) {
      return { status: 'error', message: 'Chỉ tài xế mới được gửi vị trí.' }
    }

    try {
      await this.trackingAccessService.assertCanPublishTripLocation(user, parsed.data.tripId)
    } catch {
      return { status: 'error', message: 'Bạn không phải tài xế của chuyến này.' }
    }

    this.logger.debug(
      `📍 Tài xế (ID: ${user.userId}) cập nhật GPS chuyến đi #${parsed.data.tripId}: [${parsed.data.lat}, ${parsed.data.lng}]`,
    )

    // Phát lại thông tin vào broadcast room của chuyến đi
    this.server.to(`trip_${parsed.data.tripId}`).emit('locationUpdated', {
      driverId: user.userId,
      tripId: parsed.data.tripId,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      timestamp: new Date().toISOString(),
    })

    // Feedback lại cho tài xế là đã nhận (Acknowledge)
    return { status: 'success' }
  }

  /**
   * KHÁCH HÀNG (CUSTOMER) tham gia room để nhận live tracking
   *
   * Bảo mật:
   * - Validate tripId input
   * - Kiểm tra quyền: Customer chỉ join room của trip chứa đơn mình
   * - Driver chỉ join room trip mình đang lái
   * - Admin/Staff join bất kỳ
   */
  @SubscribeMessage('joinTripTracking')
  async handleJoinRoom(@MessageBody() data: { tripId: number }, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user
    if (!user) {
      return { event: 'error', message: 'Unauthorized' }
    }

    // Validate input
    const parsed = TripRoomSchema.safeParse(data)
    if (!parsed.success) {
      return { event: 'error', message: 'tripId không hợp lệ' }
    }

    // Kiểm tra quyền truy cập trip (ngăn Customer theo dõi đơn người khác)
    const hasAccess = await this.verifyTripAccess(user, parsed.data.tripId)
    if (!hasAccess) {
      this.logger.warn(`🚫 userId=${user.userId} role=${user.roleName} bị chặn join room trip_${parsed.data.tripId}`)
      return { event: 'error', message: 'Bạn không có quyền theo dõi chuyến xe này.' }
    }

    // Cho phép socket tham gia vào Room riêng biệt
    void client.join(`trip_${parsed.data.tripId}`)
    this.logger.log(`👥 Client ${client.id} (userId=${user.userId}) joined tracking room: trip_${parsed.data.tripId}`)

    return { event: 'joined', message: `Successfully joined trip_${parsed.data.tripId}` }
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

    // Validate input
    const parsed = TripRoomSchema.safeParse(data)
    if (!parsed.success) {
      return { event: 'error', message: 'tripId không hợp lệ' }
    }

    void client.leave(`trip_${parsed.data.tripId}`)
    this.logger.log(`🚶‍♂️ Client ${client.id} (userId=${user.userId}) left tracking room: trip_${parsed.data.tripId}`)

    return { event: 'left', message: `Successfully left trip_${parsed.data.tripId}` }
  }

  @OnEvent('trip.created')
  handleTripCreatedEvent(payload: { trip: { id: number; [key: string]: unknown } }) {
    this.logger.log(`🚀 Chuyến xe mới được tạo: Trip ID #${payload.trip?.id}. Đang broadcast tới dashboard...`)
    this.server.emit('dashboard.tripCreated', payload.trip)
  }

  @OnEvent('eta.updated')
  handleEtaUpdatedEvent(payload: {
    stops: { eta: Date; orderId: number | null; stopId: number; stopSequence: number }[]
    tripId: number
  }) {
    // ETA update được publish vào room trip hiện có để admin/customer đang theo dõi không cần polling timeline.
    this.server.to(`trip_${payload.tripId}`).emit('eta.updated', {
      stops: payload.stops.map((stop) => ({
        ...stop,
        eta: stop.eta.toISOString(),
      })),
      timestamp: new Date().toISOString(),
      tripId: payload.tripId,
    })
  }
}
