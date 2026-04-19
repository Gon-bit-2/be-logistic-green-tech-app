import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Query } from '@nestjs/common'
import { AutoDispatchQueryDto, GetTripListDto } from '../dto/trip.dto'
import { TRIP_STATUS } from 'src/common/constants/strip.constant'
import { TripsService } from '../service/trips.service'

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post('auto-dispatch')
  autoDispatch(@Query() query: AutoDispatchQueryDto) {
    if (query.hubId) {
      return this.tripsService.autoDispatchLocalTask(query.hubId)
    }
    // Chạy global fan-out nếu được phép (có config ở middleware sau)
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Post('auto-dispatch/all')
  autoDispatchAll() {
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Get()
  findAll(@Query() query: GetTripListDto) {
    return this.tripsService.findAll(query)
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.findById(id)
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: keyof typeof TRIP_STATUS) {
    return this.tripsService.updateStatus(id, status)
  }

  @Patch(':id/cancel-order/:orderId')
  cancelOrder(@Param('id', ParseIntPipe) id: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.tripsService.cancelOrderFromTrip(id, orderId)
  }
}
