import { Controller, Post, Param, Get, ParseIntPipe } from '@nestjs/common'
import { GreenTechService } from '../service/green-tech.service'
import { Auth } from 'src/common/decorators/auth.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { AuthType } from 'src/common/constants/auth.constant'

@Controller('green-tech')
export class GreenTechController {
  constructor(private readonly greenTechService: GreenTechService) {}

  /**
   * Tính toán Emission bằng tay / force update kết quả emission cho 1 chuyến.
   * Quản trị viên (ADMIN) mới có quyền truy cập endpoint này.
   */
  @Post('calculate/:tripId')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN)
  calculateForTrip(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.greenTechService.calculateTripEmission(tripId)
  }

  /**
   * Lấy lịch sử Emission của 1 chuyến tham chiếu thông số. Dùng cho việc trace audit.
   */
  @Get('trips/:tripId')
  @Auth(AuthType.Bearer)
  @Roles(roleName.ADMIN, roleName.DRIVER)
  getTripLogs(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.greenTechService.getTripEmissionHistory(tripId)
  }
}
