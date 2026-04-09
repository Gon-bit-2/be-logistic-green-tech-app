import { Module } from '@nestjs/common'
import { VehicleController } from 'src/modules/vehicle/controller/vehicle.controller'
import { VehicleService } from 'src/modules/vehicle/service/vehicle.service'
import { VehicleRepository } from 'src/modules/vehicle/repository/vehicle.repo'
import { PrismaService } from 'src/database/prisma.service'
import { VehicleTranslationModule } from './vehicle-translation/vehicle-translation.module'

@Module({
  controllers: [VehicleController],
  providers: [VehicleService, VehicleRepository, PrismaService],
  exports: [VehicleService],
  imports: [VehicleTranslationModule],
})
export class VehicleModule {}
