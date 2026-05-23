import { Injectable } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import {
  AddOrdersToTripType,
  ApproveDriverAssignmentRequestType,
  AssignmentRequestInboxResType,
  AssignVehicleType,
  CreateDriverAssignmentRequestType,
  CreateManualTripType,
  DispatchBoardQuerySchema,
  DispatchBoardResType,
  DispatchApproveType,
  DispatchBoardQueryType,
  DriverAssignmentRequestListResType,
  DriverAssignmentRequestResType,
  DriverDispatchBoardQuerySchema,
  DriverDispatchBoardQueryType,
  DriverDispatchBoardResType,
  GetTripListQueryType,
  RejectDriverAssignmentRequestType,
  UpdateTripStatusType,
} from '../model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { DispatchService } from './dispatch.service'
import { DispatchBoardService } from './dispatch-board.service'
import { DriverAssignmentService } from './driver-assignment.service'
import { TripExecutionService } from './trip-execution.service'
import { TripRouteOptimizationService } from './trip-route-optimization.service'

/**
 * Facade service keeping backward-compatibility for Trips Controller.
 * Service Facade duy trì khả năng tương thích ngược cho Trips Controller.
 *
 * Delegates specialized operations to individual dedicated sub-services to preserve modularity.
 * Ủy thác các hoạt động chuyên biệt cho từng dịch vụ con chuyên dụng để duy trì tính module hóa.
 *
 * @class TripsService
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly dispatchBoardService: DispatchBoardService,
    private readonly driverAssignmentService: DriverAssignmentService,
    private readonly tripExecutionService: TripExecutionService,
    private readonly tripRouteOptimizationService: TripRouteOptimizationService,
    private readonly tripRepo: TripRepository,
  ) {}

  // ========================
  // DISPATCH — Delegate sang DispatchService
  // ========================

  /**
   * Triggers the auto-dispatch algorithm locally for a specific Hub.
   * Kích hoạt thuật toán điều phối tự động cục bộ cho một Hub cụ thể.
   *
   * @param {number} hubId - Hub ID.
   * @param {number} hubId - ID của Hub.
   * @returns Auto-dispatch task status.
   * @returns Trạng thái tác vụ điều phối tự động.
   */
  async autoDispatchLocalTask(hubId: number) {
    return this.dispatchService.autoDispatchLocalTask(hubId)
  }

  /**
   * Triggers global auto-dispatch operations across all active Hubs.
   * Kích hoạt các hoạt động điều phối tự động toàn cầu trên tất cả các Hub đang hoạt động.
   *
   * @returns Global auto-dispatch task summary.
   * @returns Tóm tắt tác vụ điều phối tự động toàn cầu.
   */
  async autoDispatchGlobalTask() {
    return this.dispatchService.autoDispatchGlobalTask()
  }

  /**
   * Generates a preview of groupable orders into suggested trips before actual creation.
   * Tạo bản xem trước các đơn hàng có thể gom vào chuyến đi gợi ý trước khi tạo thực tế.
   *
   * @param {number | undefined} requestedHubId - Optional Hub ID filter.
   * @param {number | undefined} requestedHubId - Bộ lọc ID Hub tùy chọn.
   * @param {AccessTokenPayload} actor - Authenticated actor.
   * @param {AccessTokenPayload} actor - Tác nhân thực hiện đã xác thực.
   * @returns Suggested trip preview payloads.
   * @returns Dữ liệu xem trước các chuyến đi gợi ý.
   */
  async previewDispatch(requestedHubId: number | undefined, actor: AccessTokenPayload) {
    return this.dispatchService.previewDispatch(requestedHubId, actor)
  }

  /**
   * Approves auto-dispatch suggested groups and creates finalized trip entities.
   * Phê duyệt các nhóm gợi ý điều phối tự động và tạo thực thể chuyến đi chính thức.
   *
   * @param {DispatchApproveType} dto - Tripping payloads.
   * @param {DispatchApproveType} dto - Dữ liệu chuyến đi phê duyệt.
   * @param {AccessTokenPayload} actor - Authenticated actor payload.
   * @param {AccessTokenPayload} actor - Payload tác nhân đã xác thực.
   * @returns Finalized trip database records.
   * @returns Bản ghi chuyến đi chính thức trong cơ sở dữ liệu.
   */
  async approveDispatch(dto: DispatchApproveType, actor: AccessTokenPayload) {
    return this.dispatchService.approveDispatch(dto, actor)
  }

  // ========================
  // DISPATCH BOARD — Delegate sang DispatchBoardService
  // ========================

  /**
   * Retrieves active administrative boards data for Hub staff.
   * Lấy dữ liệu bảng điều phối hoạt động hành chính cho nhân viên Hub.
   *
   * @param {Partial<DispatchBoardQueryType>} query - Query parameters (search, hubId, limit).
   * @param {Partial<DispatchBoardQueryType>} query - Các tham số truy vấn (tìm kiếm, hubId, giới hạn).
   * @param {AccessTokenPayload} actor - Authenticated actor session.
   * @param {AccessTokenPayload} actor - Phiên tác nhân đã xác thực.
   * @returns {Promise<DispatchBoardResType>} Dispatch board active details.
   * @returns {Promise<DispatchBoardResType>} Chi tiết bảng điều phối hoạt động.
   */
  async getDispatchBoard(
    query: Partial<DispatchBoardQueryType> | undefined,
    actor: AccessTokenPayload,
  ): Promise<DispatchBoardResType> {
    return this.dispatchBoardService.getDispatchBoard(DispatchBoardQuerySchema.parse(query ?? {}), actor)
  }

  /**
   * Retrieves specific trip boards dedicated for mobile driver interfaces.
   * Lấy bảng điều phối chuyến đi cụ thể dành riêng cho giao diện di động của tài xế.
   *
   * @param {Partial<DriverDispatchBoardQueryType>} query - Driver queries.
   * @param {Partial<DriverDispatchBoardQueryType>} query - Bộ truy vấn của tài xế.
   * @param {AccessTokenPayload} actor - Authenticated driver credentials.
   * @param {AccessTokenPayload} actor - Thông tin xác thực tài xế.
   * @returns {Promise<DriverDispatchBoardResType>} Driver trip board details.
   * @returns {Promise<DriverDispatchBoardResType>} Chi tiết bảng chuyến đi của tài xế.
   */
  async getDriverDispatchBoard(
    query: Partial<DriverDispatchBoardQueryType> | undefined,
    actor: AccessTokenPayload,
  ): Promise<DriverDispatchBoardResType> {
    return this.dispatchBoardService.getDriverDispatchBoard(DriverDispatchBoardQuerySchema.parse(query ?? {}), actor)
  }

  // ========================
  // DRIVER ASSIGNMENT — Delegate sang DriverAssignmentService
  // ========================

  /**
   * Lists all trip assignment requests submitted by the authenticated driver.
   * Danh sách tất cả các yêu cầu phân công chuyến đi do tài xế tự đề xuất.
   *
   * @param {AccessTokenPayload} actor - Authenticated driver.
   * @param {AccessTokenPayload} actor - Tài xế đã xác thực.
   * @returns {Promise<DriverAssignmentRequestListResType>} Active driver assignment requests.
   * @returns {Promise<DriverAssignmentRequestListResType>} Yêu cầu phân công tài xế hoạt động.
   */
  async listDriverAssignmentRequests(actor: AccessTokenPayload): Promise<DriverAssignmentRequestListResType> {
    return this.driverAssignmentService.listDriverAssignmentRequests(actor)
  }

  /**
   * Submits a request for a driver to be assigned to a specific active trip.
   * Gửi yêu cầu từ tài xế để được phân công vào một chuyến đi đang hoạt động cụ thể.
   *
   * @param {CreateDriverAssignmentRequestType} dto - Trip ID request.
   * @param {CreateDriverAssignmentRequestType} dto - Dữ liệu yêu cầu phân công (Trip ID).
   * @param {AccessTokenPayload} actor - Driver actor credentials.
   * @param {AccessTokenPayload} actor - Thông tin tài xế thực hiện.
   * @returns {Promise<DriverAssignmentRequestResType>} Created request details.
   * @returns {Promise<DriverAssignmentRequestResType>} Chi tiết yêu cầu đã tạo.
   */
  async createDriverAssignmentRequest(
    dto: CreateDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    return this.driverAssignmentService.createDriverAssignmentRequest(dto, actor)
  }

  /**
   * Retrieves inbox of pending driver assignment requests for administrative review.
   * Lấy danh sách các yêu cầu phân công tài xế đang chờ xử lý để quản trị viên duyệt.
   *
   * @param {AccessTokenPayload} actor - Authenticated staff credentials.
   * @param {AccessTokenPayload} actor - Thông tin nhân viên xác thực.
   * @returns {Promise<AssignmentRequestInboxResType>} List of pending requests.
   * @returns {Promise<AssignmentRequestInboxResType>} Danh sách các yêu cầu đang chờ.
   */
  async listAssignmentRequests(actor: AccessTokenPayload): Promise<AssignmentRequestInboxResType> {
    return this.driverAssignmentService.listAssignmentRequests(actor)
  }

  /**
   * Approves a driver's trip assignment request.
   * Phê duyệt yêu cầu phân công chuyến đi của tài xế.
   *
   * @param {number} requestId - Request database ID.
   * @param {number} requestId - ID yêu cầu trong CSDL.
   * @param {ApproveDriverAssignmentRequestType} dto - Driver and vehicle details.
   * @param {ApproveDriverAssignmentRequestType} dto - Thông tin tài xế và phương tiện.
   * @param {AccessTokenPayload} actor - Administrative actor session.
   * @param {AccessTokenPayload} actor - Phiên quản trị xác thực.
   * @returns {Promise<DriverAssignmentRequestResType>} Approved request status.
   * @returns {Promise<DriverAssignmentRequestResType>} Trạng thái yêu cầu đã phê duyệt.
   */
  async approveAssignmentRequest(
    requestId: number,
    dto: ApproveDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    return this.driverAssignmentService.approveAssignmentRequest(requestId, dto, actor)
  }

  /**
   * Rejects a driver's trip assignment request.
   * Từ chối yêu cầu phân công chuyến đi của tài xế.
   *
   * @param {number} requestId - Request database ID.
   * @param {number} requestId - ID yêu cầu trong CSDL.
   * @param {RejectDriverAssignmentRequestType} dto - Rejection reason comments.
   * @param {RejectDriverAssignmentRequestType} dto - Thông tin lý do từ chối.
   * @param {AccessTokenPayload} actor - Administrative actor session.
   * @param {AccessTokenPayload} actor - Phiên quản trị xác thực.
   * @returns {Promise<DriverAssignmentRequestResType>} Rejected request status.
   * @returns {Promise<DriverAssignmentRequestResType>} Trạng thái yêu cầu đã từ chối.
   */
  async rejectAssignmentRequest(
    requestId: number,
    dto: RejectDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    return this.driverAssignmentService.rejectAssignmentRequest(requestId, dto, actor)
  }

  // ========================
  // TRIP EXECUTION — Delegate sang TripExecutionService
  // ========================

  /**
   * Locates trips matching general filter parameters.
   * Tìm kiếm các chuyến đi khớp các tham số bộ lọc chung.
   *
   * @param {GetTripListQueryType} query - Filter parameters.
   * @param {GetTripListQueryType} query - Các tham số bộ lọc.
   * @param {AccessTokenPayload} actor - Context actor.
   * @param {AccessTokenPayload} actor - Tác nhân ngữ cảnh.
   * @returns List of trips matching query.
   * @returns Danh sách chuyến đi khớp bộ lọc.
   */
  async findAll(query: GetTripListQueryType, actor: AccessTokenPayload) {
    return this.tripExecutionService.getTrips(query, actor)
  }

  /**
   * Retrieves single Trip details with stops by database ID.
   * Lấy chi tiết một chuyến đi kèm các điểm dừng bằng ID cơ sở dữ liệu.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @returns Trip entity details.
   * @returns Chi tiết thực thể chuyến đi.
   * @throws {NotFoundException} If the trip is not found.
   * @throws {NotFoundException} Nếu không tìm thấy chuyến đi.
   */
  async findById(id: number) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${id}`)
    return trip
  }

  /**
   * Manually creates a new Trip entity from administrative inputs.
   * Tạo thủ công một thực thể Chuyến đi mới từ dữ liệu quản trị đầu vào.
   *
   * @param {CreateManualTripType} dto - Trip specs (driver, vehicle, orders).
   * @param {CreateManualTripType} dto - Thông số chuyến đi (tài xế, xe, đơn hàng).
   * @param {AccessTokenPayload} actor - Authenticated creator.
   * @param {AccessTokenPayload} actor - Người tạo đã xác thực.
   * @returns Created trip record.
   * @returns Bản ghi chuyến đi đã tạo.
   */
  async createManualTrip(dto: CreateManualTripType, actor: AccessTokenPayload) {
    return this.tripExecutionService.manualCreateTrip(dto, actor)
  }

  /**
   * Binds a specific vehicle to a trip.
   * Gán một phương tiện cụ thể cho một chuyến đi.
   *
   * @param {number} tripId - Trip ID.
   * @param {number} tripId - ID chuyến đi.
   * @param {AssignVehicleType} dto - Vehicle ID.
   * @param {AssignVehicleType} dto - ID phương tiện.
   * @param {AccessTokenPayload} actor - Administrative actor session.
   * @param {AccessTokenPayload} actor - Phiên quản trị xác thực.
   * @returns Updated trip details.
   * @returns Chi tiết chuyến đi đã cập nhật.
   */
  async assignVehicleToTrip(tripId: number, dto: AssignVehicleType, actor: AccessTokenPayload) {
    return this.tripExecutionService.reassignTripVehicle(tripId, dto, actor)
  }

  /**
   * Safely transitions the trip status across lifecycle boundaries.
   * Chuyển đổi trạng thái chuyến đi qua các ranh giới vòng đời an toàn.
   *
   * Handles start, complete, and cancel lifecycle hooks.
   * Xử lý các hook vòng đời khởi hành, hoàn thành và hủy bỏ.
   *
   * @param {number} id - Trip ID.
   * @param {number} id - ID chuyến đi.
   * @param {UpdateTripStatusType} body - Target status state.
   * @param {UpdateTripStatusType} body - Trạng thái đích.
   * @param {AccessTokenPayload} actor - Actor credentials.
   * @param {AccessTokenPayload} actor - Thông tin xác thực tác nhân.
   * @returns Updated trip details.
   * @returns Chi tiết chuyến đi đã cập nhật.
   * @throws {BadRequestException} If the status is not valid.
   * @throws {BadRequestException} Nếu trạng thái không hợp lệ.
   */
  async updateStatus(id: number, body: UpdateTripStatusType, actor: AccessTokenPayload) {
    const newStatus = body.status

    if (newStatus === TRIP_STATUS.IN_PROGRESS) {
      return this.tripExecutionService.startTrip(id, actor)
    }

    if (newStatus === TRIP_STATUS.CANCELLED) {
      return this.tripExecutionService.cancelTrip(id, {}, actor)
    }

    if (newStatus === TRIP_STATUS.COMPLETED) {
      return this.tripExecutionService.completeTrip(id, actor)
    }

    throw new BadRequestException(`Trạng thái "${newStatus}" không hợp lệ.`)
  }

  /**
   * Re-evaluates stops order utilizing distance optimization algorithms.
   * Đánh giá lại thứ tự điểm dừng sử dụng thuật toán tối ưu hóa quãng đường.
   *
   * @param {number} tripId - Trip ID.
   * @param {number} tripId - ID chuyến đi.
   * @returns Route optimization stops order and geometry.
   * @returns Thứ tự điểm dừng và hình học tuyến đường đã tối ưu hóa.
   */
  async optimizeRouteForTrip(tripId: number) {
    return this.tripRouteOptimizationService.optimizeRouteForTrip(tripId)
  }

  /**
   * Add a list of orders to a PENDING trip stop sequence.
   * Thêm danh sách đơn hàng vào chuỗi điểm dừng của chuyến đi đang PENDING.
   *
   * @param {number} tripId - Trip ID.
   * @param {number} tripId - ID chuyến đi.
   * @param {AddOrdersToTripType} dto - Orders list.
   * @param {AddOrdersToTripType} dto - Danh sách đơn hàng cần thêm.
   * @param {AccessTokenPayload} actor - Authenticated staff.
   * @param {AccessTokenPayload} actor - Nhân viên kho đã xác thực.
   * @returns Updated trip.
   * @returns Chuyến đi đã cập nhật.
   */
  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor: AccessTokenPayload) {
    return this.tripExecutionService.addOrdersToTrip(tripId, dto, actor)
  }

  /**
   * Removes a specific order stop from a PENDING trip.
   * Loại bỏ một điểm dừng đơn hàng cụ thể khỏi chuyến đi đang PENDING.
   *
   * @param {number} tripId - Trip ID.
   * @param {number} tripId - ID chuyến đi.
   * @param {number} orderId - Order ID to remove.
   * @param {number} orderId - ID đơn hàng mục tiêu cần loại bỏ.
   * @returns Updated trip without the order.
   * @returns Chuyến đi đã cập nhật không còn đơn hàng bị loại bỏ.
   */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.tripExecutionService.cancelOrderFromTrip(tripId, orderId)
  }
}
