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

/**
 * Controller managing HTTP endpoints for Trip lifecycles and dispatches.
 * Controller quản lý các endpoint HTTP cho vòng đời chuyến đi và điều phối.
 *
 * Implements manual scheduling, auto dispatches, route optimizations,
 * driver assignments, ETA calculation, and status updates.
 * Triển khai lập lịch thủ công, điều phối tự động, tối ưu hóa tuyến đường,
 * phân công tài xế, tính toán ETA và cập nhật trạng thái.
 */
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly etaService: EtaService,
  ) {}

  /**
   * Manually creates a new trip entity.
   * Tạo thủ công một thực thể chuyến đi mới.
   *
   * @param {CreateManualTripDto} body - Manual trip parameters (vehicle, driver, orders).
   * @param {CreateManualTripDto} body - Các tham số chuyến đi thủ công (xe, tài xế, đơn hàng).
   * @param {AccessTokenPayload} user - Authenticated user payload.
   * @param {AccessTokenPayload} user - Payload người dùng đã xác thực.
   * @returns {Promise<any>} The created trip details.
   * @returns {Promise<any>} Chi tiết chuyến đi đã tạo.
   */
  @Post('manual')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async createManualTrip(@Body() body: CreateManualTripDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.createManualTrip(body, user)
  }

  /**
   * Generates a preview of potential trips for auto-dispatch.
   * Tạo bản xem trước các chuyến đi tiềm năng để tự động điều phối.
   *
   * @param {DispatchPreviewQueryDto} query - Query parameters containing hubId.
   * @param {DispatchPreviewQueryDto} query - Tham số truy vấn chứa hubId.
   * @param {AccessTokenPayload} user - Authenticated actor.
   * @param {AccessTokenPayload} user - Tác nhân thực hiện đã xác thực.
   * @returns Previews of orders grouped into potential trips.
   * @returns Xem trước các đơn hàng được nhóm thành các chuyến đi tiềm năng.
   */
  @Get('dispatch-preview')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  dispatchPreview(@Query() query: DispatchPreviewQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.previewDispatch(query.hubId, user)
  }

  /**
   * Retrieves active trips displayed on the dispatch board.
   * Lấy danh sách các chuyến đi hoạt động hiển thị trên bảng điều phối.
   *
   * @param {DispatchBoardQueryDto} query - Hub filters and page limits.
   * @param {DispatchBoardQueryDto} query - Bộ lọc Hub và giới hạn phân trang.
   * @param {AccessTokenPayload} user - Authenticated actor.
   * @param {AccessTokenPayload} user - Tác nhân thực hiện đã xác thực.
   * @returns Active trip details for administrative hub monitor.
   * @returns Chi tiết các chuyến đi hoạt động để giám sát kho quản trị.
   */
  @Get('dispatch-board')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(DispatchBoardResDto)
  dispatchBoard(@Query() query: DispatchBoardQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.getDispatchBoard(query, user)
  }

  /**
   * Retrieves active trip details relevant for driver mobile apps.
   * Lấy chi tiết chuyến đi hoạt động phù hợp cho ứng dụng di động của tài xế.
   *
   * @param {DriverDispatchBoardQueryDto} query - Page parameters and statuses.
   * @param {DriverDispatchBoardQueryDto} query - Tham số trang và trạng thái.
   * @param {AccessTokenPayload} user - Authenticated driver context.
   * @param {AccessTokenPayload} user - Ngữ cảnh tài xế đã xác thực.
   * @returns Driver-specific active trip payloads.
   * @returns Dữ liệu chuyến đi hoạt động dành riêng cho tài xế.
   */
  @Get('driver-dispatch-board')
  @Roles(roleName.DRIVER)
  @ZodSerializerDto(DriverDispatchBoardResDto)
  driverDispatchBoard(@Query() query: DriverDispatchBoardQueryDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.getDriverDispatchBoard(query, user)
  }

  /**
   * Lists driver-initiated assignment requests.
   * Danh sách các yêu cầu phân công do tài xế tự đề xuất.
   *
   * @param {AccessTokenPayload} user - Authenticated driver.
   * @param {AccessTokenPayload} user - Tài xế đã xác thực.
   * @returns List of assignment request structures.
   * @returns Danh sách các cấu trúc yêu cầu phân công.
   */
  @Get('driver-assignment-requests')
  @Roles(roleName.DRIVER)
  @ZodSerializerDto(DriverAssignmentRequestListResDto)
  driverAssignmentRequests(@ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.listDriverAssignmentRequests(user)
  }

  /**
   * Creates a request from a driver to be assigned to a specific trip.
   * Tạo yêu cầu từ tài xế để được phân công vào một chuyến đi cụ thể.
   *
   * @param {CreateDriverAssignmentRequestDto} body - Trip ID.
   * @param {CreateDriverAssignmentRequestDto} body - ID chuyến đi.
   * @param {AccessTokenPayload} user - Authenticated driver actor.
   * @param {AccessTokenPayload} user - Tác nhân tài xế đã xác thực.
   * @returns Created assignment request details.
   * @returns Chi tiết yêu cầu phân công đã tạo.
   */
  @Post('driver-assignment-requests')
  @Roles(roleName.DRIVER)
  createDriverAssignmentRequest(
    @Body() body: CreateDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.createDriverAssignmentRequest(body, user)
  }

  /**
   * Retrieves active trip assignment requests for warehouse hub staffs.
   * Lấy danh sách các yêu cầu phân công chuyến đi hoạt động cho nhân viên kho.
   *
   * @param {AccessTokenPayload} user - Authenticated staff.
   * @param {AccessTokenPayload} user - Nhân viên kho đã xác thực.
   * @returns List of pending driver assignment requests.
   * @returns Danh sách các yêu cầu phân công tài xế đang chờ duyệt.
   */
  @Get('assignment-requests')
  @Roles(roleName.WAREHOUSE_STAFF)
  assignmentRequests(@ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.listAssignmentRequests(user)
  }

  /**
   * Approves a driver's request for trip assignment.
   * Phê duyệt yêu cầu phân công chuyến đi của tài xế.
   *
   * @param {number} id - Request ID.
   * @param {number} id - ID yêu cầu.
   * @param {ApproveDriverAssignmentRequestDto} body - Validation parameters.
   * @param {ApproveDriverAssignmentRequestDto} body - Tham số xác thực.
   * @param {AccessTokenPayload} user - Authenticated staff actor.
   * @param {AccessTokenPayload} user - Tác nhân nhân viên kho đã xác thực.
   * @returns Approved request state.
   * @returns Trạng thái yêu cầu đã phê duyệt.
   */
  @Patch('assignment-requests/:id/approve')
  @Roles(roleName.WAREHOUSE_STAFF)
  approveAssignmentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.approveAssignmentRequest(id, body, user)
  }

  /**
   * Rejects a driver's request for trip assignment.
   * Từ chối yêu cầu phân công chuyến đi của tài xế.
   *
   * @param {number} id - Request ID.
   * @param {number} id - ID yêu cầu.
   * @param {RejectDriverAssignmentRequestDto} body - Rejection reasons.
   * @param {RejectDriverAssignmentRequestDto} body - Lý do từ chối.
   * @param {AccessTokenPayload} user - Authenticated staff actor.
   * @param {AccessTokenPayload} user - Tác nhân nhân viên kho đã xác thực.
   * @returns Rejected request state.
   * @returns Trạng thái yêu cầu đã từ chối.
   */
  @Patch('assignment-requests/:id/reject')
  @Roles(roleName.WAREHOUSE_STAFF)
  rejectAssignmentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectDriverAssignmentRequestDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.rejectAssignmentRequest(id, body, user)
  }

  /**
   * Confirms and approves auto-dispatch suggestions.
   * Xác nhận và phê duyệt các gợi ý điều phối tự động.
   *
   * @param {DispatchApproveDto} body - Suggested trips to solidify.
   * @param {DispatchApproveDto} body - Các chuyến đi gợi ý cần chốt.
   * @param {AccessTokenPayload} user - Authenticated staff actor.
   * @param {AccessTokenPayload} user - Tác nhân nhân viên kho đã xác thực.
   * @returns Solidified trip database entities.
   * @returns Các thực thể chuyến đi chính thức trong cơ sở dữ liệu.
   */
  @Post('dispatch-approve')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  dispatchApprove(@Body() body: DispatchApproveDto, @ActiveUser() user: AccessTokenPayload) {
    return this.tripsService.approveDispatch(body, user)
  }

  /**
   * Manually binds a specific vehicle to an active trip.
   * Gán thủ công một phương tiện cụ thể cho một chuyến đi hoạt động.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {AssignVehicleDto} body - Vehicle ID.
   * @param {AssignVehicleDto} body - ID phương tiện.
   * @param {AccessTokenPayload} user - Authenticated administrative actor.
   * @param {AccessTokenPayload} user - Tác nhân quản trị đã xác thực.
   * @returns Updated trip details.
   * @returns Chi tiết chuyến đi đã cập nhật.
   */
  @Patch(':id/vehicle')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async assignVehicleToTrip(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignVehicleDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.assignVehicleToTrip(id, body, user)
  }

  /**
   * Inserts cargo orders to an active trip.
   * Chèn các đơn hàng vận chuyển vào một chuyến đi đang hoạt động.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {AddOrdersToTripDto} body - Order IDs.
   * @param {AddOrdersToTripDto} body - Danh sách ID đơn hàng.
   * @param {AccessTokenPayload} user - Authenticated staff.
   * @param {AccessTokenPayload} user - Nhân viên kho đã xác thực.
   * @returns Updated trip.
   * @returns Chuyến đi đã cập nhật.
   */
  @Post(':id/orders')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async addOrdersToTrip(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AddOrdersToTripDto,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return this.tripsService.addOrdersToTrip(id, body, user)
  }

  /**
   * Triggers background auto-dispatch execution tasks using algorithms.
   * Kích hoạt tác vụ chạy ngầm điều phối tự động sử dụng thuật toán.
   *
   * @param {AutoDispatchQueryDto} query - Optional local hub ID constraints.
   * @param {AutoDispatchQueryDto} query - Ràng buộc ID Hub cục bộ tùy chọn.
   * @returns Accept status and task tracking IDs.
   * @returns Trạng thái chấp nhận và ID theo dõi tác vụ.
   */
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

  /**
   * Triggers global multi-hub auto-dispatch procedures.
   * Kích hoạt quy trình điều phối tự động trên toàn cầu đa Hub.
   *
   * @returns Task tracking information.
   * @returns Thông tin theo dõi tác vụ.
   */
  @Post('auto-dispatch/all')
  @Roles(roleName.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ZodSerializerDto(AutoDispatchResDto)
  autoDispatchAll() {
    return this.tripsService.autoDispatchGlobalTask()
  }

  /**
   * Re-arranges stops inside a trip using routing solvers to minimize total path distance.
   * Sắp xếp lại các điểm dừng trong chuyến đi bằng bộ giải tuyến đường để giảm thiểu quãng đường.
   *
   * @param {number} id - Target Trip ID.
   * @param {number} id - ID chuyến đi mục tiêu.
   * @returns Optimized stops sequencing and polyline.
   * @returns Thứ tự điểm dừng đã tối ưu hóa và polyline mới.
   */
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

  /**
   * Re-evaluates Estimated Time of Arrival (ETA) values based on real geographic conditions.
   * Đánh giá lại thời gian dự kiến đến (ETA) dựa trên điều kiện địa lý thực tế.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @returns Recalculated stop schedules.
   * @returns Lịch trình điểm dừng đã được tính toán lại.
   */
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

  /**
   * Retrieves active stop schedules and ETAs.
   * Lấy lịch trình điểm dừng và ETA hoạt động.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {AccessTokenPayload} user - Authenticated actor.
   * @param {AccessTokenPayload} user - Tác nhân đã xác thực.
   * @returns ETAs details.
   * @returns Chi tiết các ETA.
   */
  @Get(':id/eta')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER, roleName.CUSTOMER)
  getTripEta(@Param('id', ParseIntPipe) id: number, @ActiveUser() user: AccessTokenPayload) {
    return this.etaService.getTripEta(user, id)
  }

  /**
   * Locates all active trips matching query filters.
   * Tìm kiếm tất cả các chuyến đi hoạt động khớp bộ lọc truy vấn.
   *
   * @param {GetTripListDto} query - Filter parameters.
   * @param {GetTripListDto} query - Tham số bộ lọc.
   * @param {AccessTokenPayload} user - Authenticated actor.
   * @param {AccessTokenPayload} user - Tác nhân đã xác thực.
   * @returns Paginated list of trips.
   * @returns Danh sách chuyến đi được phân trang.
   */
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

  /**
   * Locates detailed trip information by ID.
   * Tìm kiếm thông tin chi tiết chuyến đi bằng ID.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @returns Trip entity details with stops.
   * @returns Chi tiết thực thể chuyến đi kèm các điểm dừng.
   */
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

  /**
   * Transitions trip status across lifecycle boundaries safely.
   * Chuyển đổi trạng thái chuyến đi qua các ranh giới vòng đời an toàn.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {UpdateTripStatusDto} body - Target status state.
   * @param {UpdateTripStatusDto} body - Trạng thái đích.
   * @param {AccessTokenPayload} user - Actor payload.
   * @param {AccessTokenPayload} user - Payload tác nhân.
   * @returns Updated trip status details.
   * @returns Chi tiết trạng thái chuyến đi đã cập nhật.
   */
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

  /**
   * Cancels/removes a specific order from an active trip.
   * Hủy/loại bỏ một đơn hàng cụ thể khỏi một chuyến đi đang hoạt động.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {number} orderId - Target Order ID to remove.
   * @param {number} orderId - ID đơn hàng mục tiêu cần loại bỏ.
   * @returns Updated trip without the cancelled order.
   * @returns Chuyến đi đã cập nhật không còn đơn hàng bị hủy.
   */
  @Patch(':id/cancel-order/:orderId')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  cancelOrder(@Param('id', ParseIntPipe) id: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.tripsService.cancelOrderFromTrip(id, orderId)
  }
}
