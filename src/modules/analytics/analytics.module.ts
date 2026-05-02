import { Module } from '@nestjs/common'
import { AnalyticsController } from './controller/analytics.controller'
import { AnalyticsService } from './service/analytics.service'
import { AnalyticsRepository } from './repository/analytics.repo'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
