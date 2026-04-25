import { Module } from '@nestjs/common'
import { NotificationService } from './service/notification.service'
import { NotificationController } from './controller/notification.controller'
import { NotificationRepository } from './repository/notification.repo'
import { PrismaService } from 'src/database/prisma.service'
import { NotificationEventListener } from './listener/notification.event.listener'

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, NotificationEventListener, PrismaService],
})
export class NotificationModule {}
