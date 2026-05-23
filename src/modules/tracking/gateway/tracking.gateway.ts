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
/**
 * Real-time Socket.IO Gateway for package tracking and GPS location streaming.
 * Provides pub-sub namespaces for GPS coordinates, manages authorization check cache,
 * and pushes location coordinates from drivers to subscribed clients (customers, warehouse staff, admins) in real-time.
 *
 * Gateway Socket.IO thời gian thực phục vụ theo dõi gói hàng và truyền tọa độ định vị GPS.
 * Cung cấp không gian tên (namespace) pub-sub cho tọa độ GPS, quản lý bộ nhớ đệm kiểm tra quyền,
 * và đẩy tọa độ vị trí từ tài xế đến các client đã đăng ký (khách hàng, nhân viên kho, admin) trong thời gian thực.
 */
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
   * Handles real-time client connection events. Enforces strict JWT validation from connection handshakes.
   * If authentication fails, the socket connection is rejected immediately.
   *
   * Xử lý các sự kiện kết nối của client thời gian thực. Bắt buộc xác thực JWT nghiêm ngặt từ handshake kết nối.
   * Nếu xác thực thất bại, kết nối socket sẽ bị từ chối ngay lập tức.
   *
   * @param client The authenticated socket instance.
   *               Đối tượng socket đã được xác thực.
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
   * Handles real-time client disconnection events.
   *
   * Xử lý sự kiện ngắt kết nối của client thời gian thực.
   *
   * @param client The authenticated socket instance.
   *               Đối tượng socket đã được xác thực.
   */
  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user
    this.logger.log(
      `❌ Client disconnected: ${client.id} | userId=${user?.userId ?? 'unknown'} | reason=${String(client.data.disconnectReason ?? 'unknown')}`,
    )
  }

  /**
   * Helper function to verify trip access permissions with cache scoping.
   * Prevents database query spam during frequent tracking room handshakes.
   *
   * Hàm hỗ trợ xác thực quyền truy cập chuyến đi kết hợp bộ đệm cache.
   * Ngăn chặn truy vấn database liên tục trong các phiên bắt tay tham gia phòng theo dõi tần suất cao.
   *
   * @param user The token payload of the user.
   *             Thông tin token của người dùng.
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns True if authorized, false otherwise.
   *          True nếu được ủy quyền, ngược lại false.
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
   * Listens to incoming GPS coordinate updates from authenticated drivers.
   * Validates coordinate bounds, asserts trip driver authorization, and broadcasts position data to trip room.
   *
   * Lắng nghe các bản cập nhật tọa độ GPS liên tục từ tài xế đã xác thực.
   * Xác thực giới hạn tọa độ, kiểm tra quyền lái chuyến đi của tài xế và phát sóng dữ liệu vị trí vào phòng của chuyến đi.
   *
   * @param data The GPS coordinates and trip ID update payload.
   *             Payload cập nhật tọa độ GPS và ID chuyến đi.
   * @param client The driver's socket instance.
   *               Đối tượng socket của tài xế.
   * @returns Acknowledge status response object.
   *          Đối tượng phản hồi xác nhận trạng thái.
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
   * Subscribes a client to a specific trip's live GPS broadcast room.
   * Validates trip scope access permissions before joining the room.
   *
   * Đăng ký một client vào phòng phát sóng GPS trực tiếp của một chuyến đi cụ thể.
   * Xác thực quyền truy cập phạm vi chuyến đi trước khi tham gia phòng.
   *
   * @param data Object containing the target trip ID.
   *             Đối tượng chứa ID chuyến đi mục tiêu.
   * @param client The subscribing client's socket instance.
   *               Đối tượng socket của client đăng ký.
   * @returns Success or error message.
   *          Thông điệp thành công hoặc báo lỗi.
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
   * Unsubscribes a client from a specific trip's live tracking room to free memory resources.
   *
   * Hủy đăng ký một client khỏi phòng theo dõi trực tiếp của một chuyến đi cụ thể để giải phóng tài nguyên bộ nhớ.
   *
   * @param data Object containing the target trip ID.
   *             Đối tượng chứa ID chuyến đi mục tiêu.
   * @param client The unsubscribing client's socket instance.
   *               Đối tượng socket của client hủy đăng ký.
   * @returns Success or error message.
   *          Thông điệp thành công hoặc báo lỗi.
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

  /**
   * Broadcasts a 'trip.created' business event to the active monitoring dashboards.
   *
   * Phát sóng sự kiện nghiệp vụ 'trip.created' (tạo chuyến đi) tới bảng điều khiển giám sát hoạt động.
   *
   * @param payload Object containing trip details.
   *                Payload chứa thông tin chuyến đi.
   */
  @OnEvent('trip.created')
  handleTripCreatedEvent(payload: { trip: { id: number; [key: string]: unknown } }) {
    this.logger.log(`🚀 Chuyến xe mới được tạo: Trip ID #${payload.trip?.id}. Đang broadcast tới dashboard...`)
    this.server.emit('dashboard.tripCreated', payload.trip)
  }

  /**
   * Listens to 'eta.updated' events and broadcasts revised arrival times directly to the active trip room.
   * Enables seamless UI updates for clients without requiring manual timeline polling.
   *
   * Lắng nghe các sự kiện 'eta.updated' (cập nhật ETA) và phát sóng thời gian đến điều chỉnh trực tiếp vào phòng chuyến đi hoạt động.
   * Cho phép cập nhật giao diện mượt mà cho khách hàng mà không cần polling thủ công timeline.
   *
   * @param payload The ETA update payload.
   *                Payload cập nhật ETA.
   */
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
