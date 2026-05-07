import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GamificationService } from './service/gamification.service'
import { GamificationController } from './controller/gamification.controller'
import { GreenTechController } from './controller/green-tech.controller'
import { GreenTechProcessor } from './processor/green-tech.processor'
import { EmissionRepository } from './repository/emission.repo'
import { GreenTechService } from './service/green-tech.service'
import { GREEN_TECH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: GREEN_TECH_QUEUE_NAME,
    }),
  ],
  controllers: [GamificationController, GreenTechController],
  providers: [GamificationService, GreenTechService, EmissionRepository, GreenTechProcessor],
  exports: [GamificationService, GreenTechService],
})
export class GreenTechModule {}
