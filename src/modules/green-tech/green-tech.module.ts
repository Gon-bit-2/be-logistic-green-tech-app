import { Module } from '@nestjs/common'
import { GamificationService } from './service/gamification.service'
import { GamificationController } from './controller/gamification.controller'

@Module({
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GreenTechModule {}
