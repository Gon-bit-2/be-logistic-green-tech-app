import { Module } from '@nestjs/common'
import { AnalyticsController } from './controller/analytics.controller'
import { AnalyticsService } from './service/analytics.service'
import { AnalyticsRepository } from './repository/analytics.repo'
import { PrismaService } from 'src/database/prisma.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository, PrismaService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
