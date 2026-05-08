import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { NOTIFICATION_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard'
import { NotificationService } from './service/notification.service'
import { NotificationController } from './controller/notification.controller'
import { NotificationRepository } from './repository/notification.repo'
import { NotificationEventListener } from './listener/notification.event.listener'
import { DatabaseModule } from 'src/database/database.module'
import { NotificationProcessor } from './processor/notification.processor'
import { NotificationGateway } from './gateway/notification.gateway'

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({}),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationEventListener,
    NotificationProcessor,
    NotificationGateway,
    WsJwtGuard,
  ],
  exports: [NotificationService, NotificationRepository],
})
export class NotificationModule {}
