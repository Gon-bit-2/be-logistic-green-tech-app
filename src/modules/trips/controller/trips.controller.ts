import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Query } from '@nestjs/common'
import { StripsService } from '../service/trips.service'
import { AutoDispatchQueryDto, GetTripListDto } from '../dto/trip.dto'
import { TRIP_STATUS } from 'src/common/constants/strip.constant'

@Controller('trips')
export class StripsController {
  constructor(private readonly stripsService: StripsService) {}

  @Post('auto-dispatch')
  autoDispatch(@Query() query: AutoDispatchQueryDto) {
    if (query.hubId) {
      return this.stripsService.autoDispatchLocalTask(query.hubId)
    }
    // Chạy global fan-out nếu được phép (có config ở middleware sau)
    return this.stripsService.autoDispatchGlobalTask()
  }

  @Post('auto-dispatch/all')
  autoDispatchAll() {
    return this.stripsService.autoDispatchGlobalTask()
  }

  @Get()
  findAll(@Query() query: GetTripListDto) {
    return this.stripsService.findAll(query)
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.stripsService.findById(id)
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: keyof typeof TRIP_STATUS) {
    return this.stripsService.updateStatus(id, status)
  }
}
