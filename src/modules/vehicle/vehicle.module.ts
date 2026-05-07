import { Module } from '@nestjs/common'
import { VehicleController } from '@src/modules/vehicle/controller/vehicle.controller'
import { VehicleService } from '@src/modules/vehicle/service/vehicle.service'
import { VehicleRepository } from '@src/modules/vehicle/repository/vehicle.repo'
import { DatabaseModule } from '@src/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [VehicleController],
  providers: [VehicleService, VehicleRepository],
  exports: [VehicleService],
})
export class VehicleModule {}
