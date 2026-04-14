import { Module } from '@nestjs/common'
import { TrackingController } from './controller/tracking.controller'
import { TrackingService } from './service/tracking.service'
import { TrackingRepository } from './repository/tracking.repo'
import { PrismaService } from 'src/database/prisma.service'
import { BullModule } from '@nestjs/bullmq'
import { GREEN_TECH_QUEUE_NAME } from 'src/common/constants/queue.constant'

@Module({
  imports: [
    BullModule.registerQueue({
      name: GREEN_TECH_QUEUE_NAME,
    }),
  ],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingRepository, PrismaService],
  exports: [TrackingService], // Export để Green Tech module có thể inject
})
export class TrackingModule {}
