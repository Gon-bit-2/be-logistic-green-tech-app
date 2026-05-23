import { Controller, Post, Param, Get, ParseIntPipe, Query, Res, HttpCode, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import { ZodSerializerDto } from 'nestjs-zod'
import { GreenTechService } from '../service/green-tech.service'
import { Auth } from 'src/common/decorators/auth.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { AuthType } from 'src/common/constants/auth.constant'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { GreenTechDashboardQuerySchema, GreenTechExportQuerySchema } from '../model/emission.model'
import {
  CustomerGreenSummaryResDto,
  EmissionLogListResponseDto,
  EmissionLogResponseDto,
  GreenTechDashboardResDto,
  OrderFootprintResDto,
} from '../dto/emission.dto'

/**
 * Controller for managing green technology parameters, carbon emission tracking, and sustainable reports.
 * 
 * Controller quản lý các tham số công nghệ xanh, theo dõi lượng khí thải carbon và báo cáo phát triển bền vững.
 */
@Controller('green-tech')
export class GreenTechController {
  /**
   * Initializes the GreenTechController.
   * 
   * Khởi tạo GreenTechController.
   * 
   * @param greenTechService - The GreenTech service instance / Instance của dịch vụ công nghệ xanh.
   */
  constructor(private readonly greenTechService: GreenTechService) {}

  /**
   * Manually triggers or forces emission calculation logs for a completed trip.
   * Only accessible by Admin.
   * 
   * Kích hoạt hoặc buộc tính toán các bản ghi phát thải carbon thủ công cho một chuyến đi đã hoàn thành.
   * Chỉ có thể truy cập bởi Admin.
   * 
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Detailed emissions log result / Kết quả chi tiết bản ghi phát thải.
   */
  @Post('calculate/:tripId')
  @HttpCode(HttpStatus.OK)
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN)
  @ZodSerializerDto(EmissionLogResponseDto)
  calculateForTrip(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.greenTechService.calculateTripEmission(tripId)
  }

  /**
   * Retrieves emission audit calculation logs history for a specific trip.
   * Accessible by Admin and Driver.
   * 
   * Lấy lịch sử các bản ghi tính toán phát thải carbon để kiểm toán cho một chuyến đi cụ thể.
   * Có thể truy cập bởi Admin và Tài xế.
   * 
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Array of emission log history entries / Mảng lịch sử các bản ghi phát thải.
   */
  @Get('trips/:tripId')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.DRIVER)
  @ZodSerializerDto(EmissionLogListResponseDto)
  getTripLogs(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.greenTechService.getTripEmissionHistory(tripId)
  }

  /**
   * Retrieves green technology dashboard analytics.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Lấy phân tích dữ liệu tổng quan cho trang dashboard công nghệ xanh.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param rawQuery - Query filters / Tham số bộ lọc truy vấn thô.
   * @returns Dashboard analytics metadata / Siêu dữ liệu phân tích trang dashboard.
   */
  @Get('dashboard')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(GreenTechDashboardResDto)
  getDashboard(@Query() rawQuery: Record<string, unknown>) {
    // Query được parse tại controller vì ZodValidationPipe custom hiện chỉ xử lý body.
    // Cách này giữ contract rõ ràng mà chưa cần thay đổi behavior global pipe.
    const query = GreenTechDashboardQuerySchema.parse(rawQuery)
    return this.greenTechService.getDashboard(query)
  }

  /**
   * Retrieves carbon footprint statistics for a specific order.
   * Accessible by Admin, Warehouse Staff, and Customer.
   * 
   * Lấy thống kê dấu chân carbon (lượng phát thải) của một đơn hàng cụ thể.
   * Có thể truy cập bởi Admin, Nhân viên kho và Khách hàng.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param orderId - Order ID / ID đơn hàng.
   * @returns Detailed carbon footprint of the order / Dấu chân carbon chi tiết của đơn hàng.
   */
  @Get('orders/:orderId/footprint')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.CUSTOMER)
  @ZodSerializerDto(OrderFootprintResDto)
  getOrderFootprint(@ActiveUser() user: AccessTokenPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.greenTechService.getOrderFootprint(user, orderId)
  }

  /**
   * Retrieves the logged-in customer's cumulative carbon emission savings summary.
   * Only accessible by Customer.
   * 
   * Lấy thông tin tóm tắt tổng lượng carbon tiết kiệm tích lũy của khách hàng đang đăng nhập.
   * Chỉ có thể truy cập bởi Khách hàng.
   * 
   * @param user - Active customer JWT payload / Payload JWT của khách hàng đang đăng nhập.
   * @param rawQuery - Filter settings / Cấu hình bộ lọc.
   * @returns Sustainability statistics details / Chi tiết thống kê phát triển bền vững.
   */
  @Get('customers/me/summary')
  @Auth(AuthType.Bearer)
  @Roles(roleName.CUSTOMER)
  @ZodSerializerDto(CustomerGreenSummaryResDto)
  getMyGreenSummary(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    const query = GreenTechDashboardQuerySchema.pick({ dateRange: true }).parse(rawQuery)
    return this.greenTechService.getMyCustomerSummary(user, query)
  }

  /**
   * Exports sustainability metrics reports to a downloadable CSV format.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Xuất báo cáo các chỉ số bền vững thành tệp tải xuống định dạng CSV.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param rawQuery - Search and filter settings / Cấu hình tìm kiếm và bộ lọc.
   * @param response - Express response object / Đối tượng response của Express.
   */
  @Get('reports/export')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  // CSV export streams through @Res(), so it intentionally bypasses ZodSerializerInterceptor.
  async exportReport(@Query() rawQuery: Record<string, unknown>, @Res() response: Response) {
    const query = GreenTechExportQuerySchema.parse(rawQuery)
    const csv = await this.greenTechService.exportReportCsv(query)

    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="green-tech-${query.scope}-${query.dateRange}.csv"`)
    response.send(csv)
  }
}
