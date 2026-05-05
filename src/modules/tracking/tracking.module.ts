import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TrackingService } from './service/tracking.service'
import { TrackingController } from './controller/tracking.controller'
import { TrackingRepository } from './repository/tracking.repo'
import { TrackingGateway } from './gateway/tracking.gateway'
import { TrackingAccessService } from './service/tracking-access.service'
import { BullModule } from '@nestjs/bullmq'
import { GREEN_TECH_QUEUE_NAME } from '../../common/constants/queue.constant'
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard'
import { SharedServicesModule } from 'src/common/services/shared-services.module'

/**
 * Module quản lý tracking & real-time WebSocket.
 *
 * Import JwtModule để WsJwtGuard có thể verify JWT token
 * cho các kết nối WebSocket (thay vì dùng HTTP guards).
 */
@Module({
  imports: [
    SharedServicesModule,
    JwtModule.register({}),
    BullModule.registerQueue({
      name: GREEN_TECH_QUEUE_NAME,
    }),
  ],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingRepository, TrackingAccessService, TrackingGateway, WsJwtGuard],
  exports: [TrackingService, TrackingGateway],
})
export class TrackingModule {}
