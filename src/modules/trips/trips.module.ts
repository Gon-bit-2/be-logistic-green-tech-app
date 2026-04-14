import { Module } from '@nestjs/common'
import { StripsService } from './service/trips.service'
import { StripsController } from './controller/trips.controller'
import { StripRepository } from './repository/trip.repository'
import { BullModule } from '@nestjs/bullmq'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { StripsProcessor } from './processor/trips.processor'

@Module({
  imports: [
    BullModule.registerQueue({
      name: AUTO_DISPATCH_QUEUE_NAME,
    }),
  ],
  controllers: [StripsController],
  providers: [StripsService, StripRepository, StripsProcessor],
  exports: [StripsService],
})
export class StripsModule {}
