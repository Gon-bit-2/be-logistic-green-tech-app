import { Module } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { VehicleTranslationController } from 'src/modules/vehicle/vehicle-translation/controller/vehicle-translation.controller'
import { VehicleTranslationService } from 'src/modules/vehicle/vehicle-translation/service/vehicle-translation.service'
import { VehicleTranslationRepository } from './repository/vehicle-translation.repo'

@Module({
  controllers: [VehicleTranslationController],
  providers: [VehicleTranslationService, PrismaService, VehicleTranslationRepository],
})
export class VehicleTranslationModule {}
