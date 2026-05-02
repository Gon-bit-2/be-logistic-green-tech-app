import { Module } from '@nestjs/common'
import { NotificationService } from './service/notification.service'
import { NotificationController } from './controller/notification.controller'
import { NotificationRepository } from './repository/notification.repo'
import { NotificationEventListener } from './listener/notification.event.listener'

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, NotificationEventListener],
})
export class NotificationModule {}
