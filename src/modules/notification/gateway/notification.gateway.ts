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

  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

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

  handleDisconnect(client: NotificationSocket) {
    this.logger.log(`Notification socket disconnected: ${client.id} userId=${client.data.user?.userId ?? 'unknown'}`)
  }

  emitNotificationCreated(userId: number, notification: unknown) {
    const room = this.getUserRoom(userId)
    const hasActiveSocket = (this.server.sockets.adapter.rooms.get(room)?.size ?? 0) > 0
    this.server.to(room).emit('notification.created', notification)
    return hasActiveSocket
  }

  emitUnreadCount(userId: number, totalUnread: number) {
    const room = this.getUserRoom(userId)
    this.server.to(room).emit('notification.unread-count', { totalUnread })
  }

  private getUserRoom(userId: number) {
    return `user:${userId}`
  }
}
