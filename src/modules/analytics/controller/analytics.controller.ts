import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AnalyticsService } from '../service/analytics.service'
import {
  DashboardSummaryResDto,
  EmissionsAnalyticsResDto,
  FleetPerformanceResDto,
  GetAnalyticsQueryDto,
  OrderAnalyticsResDto,
  SlaAnalyticsResDto,
} from '../dto/analytics.dto'
import { AuthenticationGuard } from 'src/common/guards/authentication.guard'
import { IsAdmin } from 'src/common/decorators/roles.decorator'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('analytics')
@UseGuards(AuthenticationGuard)
@IsAdmin()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ZodSerializerDto(DashboardSummaryResDto)
  getDashboardSummary(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getDashboardSummary(query)
  }

  @Get('orders')
  @ZodSerializerDto(OrderAnalyticsResDto)
  getOrdersAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getOrdersAnalytics(query)
  }

  @Get('emissions')
  @ZodSerializerDto(EmissionsAnalyticsResDto)
  getEmissionsAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getEmissionsAnalytics(query)
  }

  @Get('fleet-performance')
  @ZodSerializerDto(FleetPerformanceResDto)
  getFleetPerformance(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getFleetPerformance(query)
  }

  @Get('sla')
  @ZodSerializerDto(SlaAnalyticsResDto)
  getSlaAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getSlaAnalytics(query)
  }
}
