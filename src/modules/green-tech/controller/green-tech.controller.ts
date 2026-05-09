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

@Controller('green-tech')
export class GreenTechController {
  constructor(private readonly greenTechService: GreenTechService) {}

  /**
   * Tính toán Emission bằng tay / force update kết quả emission cho 1 chuyến.
   * Quản trị viên (ADMIN) mới có quyền truy cập endpoint này.
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
   * Lấy lịch sử Emission của 1 chuyến tham chiếu thông số. Dùng cho việc trace audit.
   */
  @Get('trips/:tripId')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.DRIVER)
  @ZodSerializerDto(EmissionLogListResponseDto)
  getTripLogs(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.greenTechService.getTripEmissionHistory(tripId)
  }

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

  @Get('orders/:orderId/footprint')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.CUSTOMER)
  @ZodSerializerDto(OrderFootprintResDto)
  getOrderFootprint(@ActiveUser() user: AccessTokenPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.greenTechService.getOrderFootprint(user, orderId)
  }

  @Get('customers/me/summary')
  @Auth(AuthType.Bearer)
  @Roles(roleName.CUSTOMER)
  @ZodSerializerDto(CustomerGreenSummaryResDto)
  getMyGreenSummary(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    const query = GreenTechDashboardQuerySchema.pick({ dateRange: true }).parse(rawQuery)
    return this.greenTechService.getMyCustomerSummary(user, query)
  }

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
