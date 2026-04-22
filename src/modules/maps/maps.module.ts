import { Module } from '@nestjs/common'
import { MapsService } from './service/maps.service'
import { MapsController } from './controller/maps.controller'

@Module({
  controllers: [MapsController],
  providers: [MapsService],
  exports: [MapsService],
})
export class MapsModule {}
