import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import {
  AUTO_DISPATCH_QUEUE_NAME,
  GREEN_TECH_QUEUE_NAME,
  NOTIFICATION_QUEUE_NAME,
} from 'src/common/constants/queue.constant'
import { DatabaseModule } from 'src/database/database.module'
import { ObservabilityController } from './observability.controller'
import { ObservabilityService } from './observability.service'

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue(
      { name: AUTO_DISPATCH_QUEUE_NAME },
      { name: GREEN_TECH_QUEUE_NAME },
      { name: NOTIFICATION_QUEUE_NAME },
    ),
  ],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [DatabaseModule],
})
export class ObservabilityModule {}
