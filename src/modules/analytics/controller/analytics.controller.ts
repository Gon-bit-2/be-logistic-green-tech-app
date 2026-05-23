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

/**
 * Controller for managing green tech analytics, emissions savings, SLA metrics, and operational performance.
 * Only accessible by Admin users.
 * 
 * Controller quản lý các phân tích công nghệ xanh, lượng khí thải tiết kiệm được, các chỉ số SLA và hiệu suất vận hành.
 * Chỉ có thể truy cập bởi tài khoản Admin.
 */
@Controller('analytics')
@UseGuards(AuthenticationGuard)
@IsAdmin()
export class AnalyticsController {
  /**
   * Initializes the AnalyticsController.
   * 
   * Khởi tạo AnalyticsController.
   * 
   * @param analyticsService - The Analytics service instance / Instance của dịch vụ phân tích.
   */
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Retrieves overall dashboard summary analytics.
   * 
   * Lấy dữ liệu phân tích tóm tắt toàn bộ dashboard.
   * 
   * @param query - Date range and filter parameters / Khoảng thời gian và tham số lọc.
   * @returns General summary metrics / Các chỉ số tóm tắt chung.
   */
  @Get('dashboard')
  @ZodSerializerDto(DashboardSummaryResDto)
  getDashboardSummary(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getDashboardSummary(query)
  }

  /**
   * Retrieves order delivery performance analytics.
   * 
   * Lấy dữ liệu phân tích hiệu suất giao nhận đơn hàng.
   * 
   * @param query - Date range and filter parameters / Khoảng thời gian và tham số lọc.
   * @returns Detailed order delivery statistics / Thống kê giao hàng chi tiết.
   */
  @Get('orders')
  @ZodSerializerDto(OrderAnalyticsResDto)
  getOrdersAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getOrdersAnalytics(query)
  }

  /**
   * Retrieves carbon emissions savings and green distance analytics.
   * 
   * Lấy dữ liệu phân tích lượng khí thải carbon tiết kiệm được và khoảng cách di chuyển xanh.
   * 
   * @param query - Date range and filter parameters / Khoảng thời gian và tham số lọc.
   * @returns Carbon reduction metrics / Các chỉ số giảm thiểu khí thải carbon.
   */
  @Get('emissions')
  @ZodSerializerDto(EmissionsAnalyticsResDto)
  getEmissionsAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getEmissionsAnalytics(query)
  }

  /**
   * Retrieves vehicle fleet operational and energy performance analytics.
   * 
   * Lấy dữ liệu phân tích hiệu suất năng lượng và vận hành của đội xe.
   * 
   * @param query - Date range and filter parameters / Khoảng thời gian và tham số lọc.
   * @returns Fleet operational performance statistics / Thống kê hiệu suất vận hành đội xe.
   */
  @Get('fleet-performance')
  @ZodSerializerDto(FleetPerformanceResDto)
  getFleetPerformance(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getFleetPerformance(query)
  }

  /**
   * Retrieves Service Level Agreement (SLA) compliance and alert analytics.
   * 
   * Lấy dữ liệu phân tích về việc tuân thủ Cam kết chất lượng dịch vụ (SLA) và cảnh báo.
   * 
   * @param query - Date range and filter parameters / Khoảng thời gian và tham số lọc.
   * @returns SLA compliance metrics / Các chỉ số tuân thủ SLA.
   */
  @Get('sla')
  @ZodSerializerDto(SlaAnalyticsResDto)
  getSlaAnalytics(@Query() query: GetAnalyticsQueryDto) {
    return this.analyticsService.getSlaAnalytics(query)
  }
}
