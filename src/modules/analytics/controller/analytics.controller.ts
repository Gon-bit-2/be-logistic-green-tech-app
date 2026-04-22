import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AnalyticsService } from '../service/analytics.service'
import { GetAnalyticsQueryDto } from '../dto/analytics.dto'
import { AuthenticationGuard } from 'src/common/guards/authentication.guard'
import { IsAdmin } from 'src/common/decorators/roles.decorator'

@Controller('analytics')
@UseGuards(AuthenticationGuard)
@IsAdmin()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboardSummary(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getDashboardSummary(query)
  }

  @Get('orders')
  getOrdersAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getOrdersAnalytics(query)
  }

  @Get('emissions')
  getEmissionsAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getEmissionsAnalytics(query)
  }

  @Get('fleet-performance')
  getFleetPerformance(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getFleetPerformance(query)
  }
}
