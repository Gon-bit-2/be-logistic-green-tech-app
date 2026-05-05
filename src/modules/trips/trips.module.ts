import { Module } from '@nestjs/common'
import { TripsService } from './service/trips.service'
import { TripsController } from './controller/trips.controller'
import { TripRepository } from './repository/trip.repository'
import { BullModule } from '@nestjs/bullmq'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { TripsProcessor } from './processor/trips.processor'
import { GreenTechModule } from '../green-tech/green-tech.module'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'
import { DispatchService } from './service/dispatch.service'
import { DispatchBoardService } from './service/dispatch-board.service'
import { DriverAssignmentService } from './service/driver-assignment.service'
import { TripExecutionService } from './service/trip-execution.service'
import { TripHubHelper } from './service/trip-hub.helper'
import { DriverAssignmentHelper } from './service/driver-assignment.helper'
import { SharedServicesModule } from 'src/common/services/shared-services.module'

@Module({
  imports: [
    SharedServicesModule,
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
  providers: [
    // === Facade giữ backward-compatibility (sẽ dần thu nhỏ) ===
    TripsService,

    // === Sub-services chuyên biệt ===
    DispatchService,          // Auto-dispatch, preview, approve
    DispatchBoardService,     // Dispatch board cho Admin/Staff/Driver
    DriverAssignmentService,  // Driver assignment request CRUD
    TripExecutionService,     // Trip lifecycle (start, cancel, query)

    // === Shared helpers ===
    TripHubHelper,            // Hub scope resolution, resource validation
    DriverAssignmentHelper,   // Assignment request mapping helpers

    // === Repositories ===
    TripRepository,
    TrackingRepository,
    TripsProcessor,
  ],
  exports: [TripsService, DispatchService, DispatchBoardService, DriverAssignmentService, TripExecutionService],
})
export class TripsModule {}
