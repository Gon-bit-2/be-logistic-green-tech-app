import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GreenTechController } from './controller/green-tech.controller'
import { GreenTechService } from './service/green-tech.service'
import { EmissionRepository } from './repository/emission.repo'
import { GreenTechProcessor } from './processor/green-tech.processor'
import { PrismaService } from 'src/database/prisma.service'
import { GREEN_TECH_QUEUE_NAME } from 'src/common/constants/queue.constant'

@Module({
  imports: [
    BullModule.registerQueue({
      name: GREEN_TECH_QUEUE_NAME,
    }),
  ],
  controllers: [GreenTechController],
  providers: [GreenTechService, EmissionRepository, GreenTechProcessor, PrismaService],
  exports: [GreenTechService],
})
export class GreenTechModule {}
