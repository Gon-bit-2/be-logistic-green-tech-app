import { Module } from '@nestjs/common'
import { GamificationService } from './service/gamification.service'
import { GamificationController } from './controller/gamification.controller'
import { PrismaService } from '../../database/prisma.service'

@Module({
  controllers: [GamificationController],
  providers: [GamificationService, PrismaService],
  exports: [GamificationService],
})
export class GreenTechModule {}
