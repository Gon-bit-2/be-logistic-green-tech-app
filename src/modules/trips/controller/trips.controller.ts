import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Query } from '@nestjs/common'
import {
  AddOrdersToTripDto,
  AssignVehicleDto,
  AutoDispatchQueryDto,
  CreateManualTripDto,
  GetTripListDto,
} from '../dto/trip.dto'
import { TRIP_STATUS } from 'src/common/constants/strip.constant'
import { TripsService } from '../service/trips.service'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ResourceAccess } from 'src/common/decorators/resource-access.decorator'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post('manual')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async createManualTrip(@Body() body: CreateManualTripDto) {
    return this.tripsService.createManualTrip(body)
  }

  @Patch(':id/vehicle')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async assignVehicleToTrip(@Param('id', ParseIntPipe) id: number, @Body() body: AssignVehicleDto) {
    return this.tripsService.assignVehicleToTrip(id, body)
  }

  @Post(':id/orders')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async addOrdersToTrip(@Param('id', ParseIntPipe) id: number, @Body() body: AddOrdersToTripDto) {
    return this.tripsService.addOrdersToTrip(id, body)
  }

  @Post('auto-dispatch')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  autoDispatch(@Query() query: AutoDispatchQueryDto) {
    if (query.hubId) {
      return this.tripsService.autoDispatchLocalTask(query.hubId)
    }
    // Chạy global fan-out nếu được phép (có config ở middleware sau)
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Post('auto-dispatch/all')
  @Roles(roleName.ADMIN)
  autoDispatchAll() {
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Post(':id/optimize-route')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ResourceAccess({
    model: 'trip',
    paramName: 'id',
    ownerField: 'driverId',
  })
  optimizeRoute(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.optimizeRouteForTrip(id)
  }

  @Get()
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  findAll(@Query() query: GetTripListDto, @ActiveUser() user: AccessTokenPayload) {
    let driverId: number | undefined
    if (user.roleName === roleName.DRIVER) {
      driverId = user.userId
    }
    return this.tripsService.findAll({ ...query, driverId })
  }

  @Get(':id')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ResourceAccess({
    model: 'trip',
    paramName: 'id',
    ownerField: 'driverId', // DRIVER chỉ được xem trip của mình
  })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.findById(id)
  }

  @Patch(':id/status')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ResourceAccess({
    model: 'trip',
    paramName: 'id',
    ownerField: 'driverId',
  })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: keyof typeof TRIP_STATUS) {
    return this.tripsService.updateStatus(id, status)
  }

  @Patch(':id/cancel-order/:orderId')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  cancelOrder(@Param('id', ParseIntPipe) id: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.tripsService.cancelOrderFromTrip(id, orderId)
  }
}
