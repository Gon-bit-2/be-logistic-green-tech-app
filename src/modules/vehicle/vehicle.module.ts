import { Module } from '@nestjs/common'
import { VehicleController } from 'src/modules/vehicle/controller/vehicle.controller'
import { VehicleService } from 'src/modules/vehicle/service/vehicle.service'

@Module({
  controllers: [VehicleController],
  providers: [VehicleService],
})
export class VehicleModule {}
