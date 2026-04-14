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
  controllers: [StripsController],
  providers: [StripsService, StripRepository, StripsProcessor],
  exports: [StripsService],
})
export class StripsModule {}
