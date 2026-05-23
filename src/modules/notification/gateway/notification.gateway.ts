import { Logger } from '@nestjs/common'
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Auth } from 'src/common/decorators/auth.decorator'
import { AuthType } from 'src/common/constants/auth.constant'
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { parseCorsOrigins } from 'src/common/utils/cors.util'
import envConfig from 'src/config/config'

type NotificationSocketData = {
  user?: AccessTokenPayload
}

type NotificationSocket = Socket & {
  data: NotificationSocketData
}

/**
 * WebSocket Gateway for handling real-time user notification deliveries.
 * 
 * WebSocket Gateway xử lý việc phân phối thông báo người dùng theo thời gian thực.
 */
@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(envConfig.CORS_ORIGINS) ?? ['http://localhost:3000'],
    credentials: true,
  },
  namespace: 'notifications',
})
@Auth(AuthType.None)
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(NotificationGateway.name)

  /**
   * Initializes the NotificationGateway.
   * 
   * Khởi tạo NotificationGateway.
   * 
   * @param wsJwtGuard - Guard to validate WebSocket JWT tokens / Guard để xác thực mã token JWT của WebSocket.
   */
  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

  /**
   * Handles incoming client connection, performs JWT authentication, and joins them to their unique user room.
   * 
   * Xử lý kết nối client gửi đến, thực hiện xác thực JWT và đưa họ vào room riêng biệt của người dùng.
   * 
   * @param client - The connecting WebSocket socket instance / Instance kết nối socket WebSocket.
   */
  async handleConnection(client: NotificationSocket) {
    const isAuthenticated = await this.wsJwtGuard.validateClient(client)
    if (!isAuthenticated || !client.data.user) {
      client.emit('exception', {
        message: 'Authentication required. Please provide a valid token via auth.token.',
        statusCode: 401,
        timestamp: new Date().toISOString(),
      })
      client.disconnect(true)
      return
    }

    const room = this.getUserRoom(client.data.user.userId)
    void client.join(room)
    this.logger.log(`Notification socket connected: ${client.id} userId=${client.data.user.userId}`)
  }

  /**
   * Handles client disconnection.
   * 
   * Xử lý khi client ngắt kết nối.
   * 
   * @param client - The disconnecting WebSocket socket instance / Instance kết nối socket WebSocket đang ngắt kết nối.
   */
  handleDisconnect(client: NotificationSocket) {
    this.logger.log(`Notification socket disconnected: ${client.id} userId=${client.data.user?.userId ?? 'unknown'}`)
  }

  /**
   * Emits a real-time event to indicate that a new notification has been created.
   * 
   * Phát sự kiện thời gian thực để thông báo rằng một thông báo mới vừa được tạo.
   * 
   * @param userId - ID of the target user / ID của người dùng đích.
   * @param notification - Notification detail payload / Payload chi tiết thông báo.
   * @returns True if there is at least one active connection in the user's room / True nếu có ít nhất một kết nối đang hoạt động trong room của người dùng.
   */
  emitNotificationCreated(userId: number, notification: unknown) {
    const room = this.getUserRoom(userId)
    const hasActiveSocket = (this.server.sockets.adapter.rooms.get(room)?.size ?? 0) > 0
    this.server.to(room).emit('notification.created', notification)
    return hasActiveSocket
  }

  /**
   * Emits the updated total count of unread notifications to the user.
   * 
   * Phát tổng số lượng thông báo chưa đọc mới nhất đến người dùng.
   * 
   * @param userId - ID of the target user / ID của người dùng đích.
   * @param totalUnread - The number of unread notifications / Số lượng thông báo chưa đọc.
   */
  emitUnreadCount(userId: number, totalUnread: number) {
    const room = this.getUserRoom(userId)
    this.server.to(room).emit('notification.unread-count', { totalUnread })
  }

  /**
   * Generates a unique room name string for a specific user ID.
   * 
   * Tạo chuỗi tên room duy nhất cho một ID người dùng cụ thể.
   * 
   * @param userId - User ID / ID người dùng.
   * @returns Room name string / Chuỗi tên room.
   */
  private getUserRoom(userId: number) {
    return `user:${userId}`
  }
}
