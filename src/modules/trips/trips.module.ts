import { Module } from '@nestjs/common'
import { TripsService } from './service/trips.service'
import { TripsController } from './controller/trips.controller'
import { TripRepository } from './repository/trip.repository'
import { BullModule } from '@nestjs/bullmq'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { TripsProcessor } from './processor/trips.processor'
import { GreenTechModule } from '../green-tech/green-tech.module'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'

@Module({
  imports: [
    GreenTechModule,
    BullModule.registerQueue({
      name: AUTO_DISPATCH_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3, // Retry tối đa 3 lần nếu worker crash/throw error
        backoff: {
          type: 'exponential', // Tăng dần thời gian chờ: 5s, 10s, 20s
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600, // Giữ job thành công trong 1 giờ để Admin có thể xem (thay vì lưu vĩnh viễn)
          count: 100, // Hoặc tối đa 100 job
        },
        removeOnFail: {
          age: 86400, // Giữ job thất bại trong 24 giờ như một dạng Dead Letter Queue tạm thời
          count: 500, // Tránh đẩy tràn Redis memory
        },
      },
    }),
  ],
  controllers: [TripsController],
  providers: [TripsService, TripRepository, TripsProcessor, TrackingRepository],
  exports: [TripsService],
})
export class TripsModule {}
