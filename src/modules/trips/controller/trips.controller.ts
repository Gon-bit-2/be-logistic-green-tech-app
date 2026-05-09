import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Query, HttpCode, HttpStatus } from '@nestjs/common'
import {
  AddOrdersToTripDto,
  ApproveDriverAssignmentRequestDto,
  AssignVehicleDto,
  AutoDispatchQueryDto,
  AutoDispatchResDto,
  CreateDriverAssignmentRequestDto,
  CreateManualTripDto,
  DispatchApproveDto,
  DispatchBoardResDto,
  DispatchBoardQueryDto,
  DispatchPreviewQueryDto,
  DriverAssignmentRequestListResDto,
  DriverDispatchBoardQueryDto,
  DriverDispatchBoardResDto,
  GetTripDetailResDto,
  GetTripListDto,
  GetTripListResDto,
  RejectDriverAssignmentRequestDto,
  UpdateTripStatusDto,
} from '../dto/trip.dto'
import { TripsService } from '../service/trips.service'
import { EtaService } from '../service/eta.service'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ResourceAccess } from 'src/common/decorators/resource-access.decorator'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly etaService: EtaService,
  ) {}

  @Post('manual')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async createManualTrip(@Body() body: CreateManualTripDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.createManualTrip(body, user)
  }

  @Get('dispatch-preview')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  dispatchPreview(@Query() query: DispatchPreviewQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.previewDispatch(query.hubId, user)
  }

  @Get('dispatch-board')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(DispatchBoardResDto)
  dispatchBoard(@Query() query: DispatchBoardQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.getDispatchBoard(query, user)
  }

  @Get('driver-dispatch-board')
  @Roles(roleName.DRIVER)
  @ZodSerializerDto(DriverDispatchBoardResDto)
  driverDispatchBoard(@Query() query: DriverDispatchBoardQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.getDriverDispatchBoard(query, user)
  }

  @Get('driver-assignment-requests')
  @Roles(roleName.DRIVER)
  @ZodSerializerDto(DriverAssignmentRequestListResDto)
  driverAssignmentRequests(@ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.listDriverAssignmentRequests(user)
  }

  @Post('driver-assignment-requests')
  @Roles(roleName.DRIVER)
  createDriverAssignmentRequest(
    @Body() body: CreateDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.createDriverAssignmentRequest(body, user)
  }

  @Get('assignment-requests')
  @Roles(roleName.WAREHOUSE_STAFF)
  assignmentRequests(@ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.listAssignmentRequests(user)
  }

  @Patch('assignment-requests/:id/approve')
  @Roles(roleName.WAREHOUSE_STAFF)
  approveAssignmentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.approveAssignmentRequest(id, body, user)
  }

  @Patch('assignment-requests/:id/reject')
  @Roles(roleName.WAREHOUSE_STAFF)
  rejectAssignmentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.rejectAssignmentRequest(id, body, user)
  }

  @Post('dispatch-approve')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  dispatchApprove(@Body() body: DispatchApproveDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.approveDispatch(body, user)
  }

  @Patch(':id/vehicle')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async assignVehicleToTrip(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignVehicleDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.assignVehicleToTrip(id, body, user)
  }

  @Post(':id/orders')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async addOrdersToTrip(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AddOrdersToTripDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.addOrdersToTrip(id, body, user)
  }

  @Post('auto-dispatch')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @HttpCode(HttpStatus.ACCEPTED)
  @ZodSerializerDto(AutoDispatchResDto)
  autoDispatch(@Query() query: AutoDispatchQueryDto) {
    if (query.hubId) {
      return this.tripsService.autoDispatchLocalTask(query.hubId)
    }
    // Chạy global fan-out nếu được phép (có config ở middleware sau)
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Post('auto-dispatch/all')
  @Roles(roleName.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ZodSerializerDto(AutoDispatchResDto)
  autoDispatchAll() {
    return this.tripsService.autoDispatchGlobalTask()
  }

  @Post(':id/optimize-route')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ResourceAccess({
    model: 'trip',
    paramName: 'id',
    ownerField: 'driverId',
  })
  optimizeRoute(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.optimizeRouteForTrip(id)
  }

  @Post(':id/recalculate-eta')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ResourceAccess({
    model: 'trip',
    paramName: 'id',
    ownerField: 'driverId',
  })
  recalculateEta(@Param('id', ParseIntPipe) id: number) {
    return this.etaService.recalculateTripEta(id)
  }

  @Get(':id/eta')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER, roleName.CUSTOMER)
  getTripEta(@Param('id', ParseIntPipe) id: number, @ActiveUser() user: AccessTokenPayload) {
    return this.etaService.getTripEta(user, id)
  }

  @Get()
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(GetTripListResDto)
  findAll(@Query() query: GetTripListDto, @ActiveUser() user: AccessTokenPayload) {
    let driverId: number | undefined
    if (user.roleName === roleName.DRIVER) {
      driverId = user.userId
    }
    return this.tripsService.findAll({ ...query, driverId }, user)
  }

  @Get(':id')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(GetTripDetailResDto)
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
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTripStatusDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.updateStatus(id, body, user)
  }

  @Patch(':id/cancel-order/:orderId')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  cancelOrder(@Param('id', ParseIntPipe) id: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.tripsService.cancelOrderFromTrip(id, orderId)
  }
}
