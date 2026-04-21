import { Module } from '@nestjs/common'
import { TrackingService } from './service/tracking.service'
import { TrackingController } from './controller/tracking.controller'
import { TrackingRepository } from './repository/tracking.repo'
import { PrismaService } from '../../database/prisma.service'
import { TrackingGateway } from './gateway/tracking.gateway'
import { BullModule } from '@nestjs/bullmq'
import { GREEN_TECH_QUEUE_NAME } from '../../common/constants/queue.constant'

@Module({
  imports: [
    BullModule.registerQueue({
      name: GREEN_TECH_QUEUE_NAME,
    }),
  ],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingRepository, PrismaService, TrackingGateway],
  exports: [TrackingService, TrackingGateway],
})
export class TrackingModule {}
