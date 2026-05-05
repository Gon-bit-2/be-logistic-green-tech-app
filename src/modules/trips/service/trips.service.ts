import { Injectable } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import {
  AddOrdersToTripType,
  ApproveDriverAssignmentRequestType,
  AssignmentRequestInboxResType,
  AssignVehicleType,
  CreateDriverAssignmentRequestType,
  CreateManualTripType,
  DispatchBoardResType,
  DispatchApproveType,
  DriverAssignmentRequestListResType,
  DriverAssignmentRequestResType,
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
 * Facade service giữ backward-compatibility cho Controller.
 *
 * Sau refactor, TripsService chỉ còn:
 * 1. Delegate methods → các sub-services chuyên biệt
 * 2. Một số methods phức tạp chưa tách (optimize route, add orders, cancel order,
 *    updateStatus, completeTripWithTracking) — sẽ tách dần ở phase tiếp theo.
 *
 * Mục tiêu: Controller không cần thay đổi, API contract giữ nguyên 100%.
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

  /** Đẩy job auto-dispatch cho 1 Hub */
  async autoDispatchLocalTask(hubId: number) {
    return this.dispatchService.autoDispatchLocalTask(hubId)
  }

  /** Fan-out auto-dispatch cho tất cả Hub */
  async autoDispatchGlobalTask() {
    return this.dispatchService.autoDispatchGlobalTask()
  }

  /** Xem trước kết quả gom chuyến */
  async previewDispatch(requestedHubId: number | undefined, actor: AccessTokenPayload) {
    return this.dispatchService.previewDispatch(requestedHubId, actor)
  }

  /** Duyệt gợi ý dispatch → tạo Trip thực */
  async approveDispatch(dto: DispatchApproveType, actor: AccessTokenPayload) {
    return this.dispatchService.approveDispatch(dto, actor)
  }

  // ========================
  // DISPATCH BOARD — Delegate sang DispatchBoardService
  // ========================

  /** Lấy bảng điều phối cho Admin/Staff */
  async getDispatchBoard(requestedHubId: number | undefined, actor: AccessTokenPayload): Promise<DispatchBoardResType> {
    return this.dispatchBoardService.getDispatchBoard(requestedHubId, actor)
  }

  /** Lấy bảng điều phối cho Driver */
  async getDriverDispatchBoard(actor: AccessTokenPayload): Promise<DriverDispatchBoardResType> {
    return this.dispatchBoardService.getDriverDispatchBoard(actor)
  }

  // ========================
  // DRIVER ASSIGNMENT — Delegate sang DriverAssignmentService
  // ========================

  /** Liệt kê yêu cầu nhận đơn của Driver */
  async listDriverAssignmentRequests(actor: AccessTokenPayload): Promise<DriverAssignmentRequestListResType> {
    return this.driverAssignmentService.listDriverAssignmentRequests(actor)
  }

  /** Driver gửi yêu cầu nhận đơn */
  async createDriverAssignmentRequest(
    dto: CreateDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    return this.driverAssignmentService.createDriverAssignmentRequest(dto, actor)
  }

  /** Liệt kê inbox assignment requests cho Staff */
  async listAssignmentRequests(actor: AccessTokenPayload): Promise<AssignmentRequestInboxResType> {
    return this.driverAssignmentService.listAssignmentRequests(actor)
  }

  /** Staff duyệt assignment request */
  async approveAssignmentRequest(
    requestId: number,
    dto: ApproveDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    return this.driverAssignmentService.approveAssignmentRequest(requestId, dto, actor)
  }

  /** Staff từ chối assignment request */
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

  /** Lấy danh sách chuyến */
  async findAll(query: GetTripListQueryType, actor: AccessTokenPayload) {
    return this.tripExecutionService.getTrips(query, actor)
  }

  /** Lấy chi tiết chuyến */
  async findById(id: number) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${id}`)
    return trip
  }

  /** Tạo Trip thủ công */
  async createManualTrip(dto: CreateManualTripType, actor: AccessTokenPayload) {
    return this.tripExecutionService.manualCreateTrip(dto, actor)
  }

  /** Chuyển xe cho Trip */
  async assignVehicleToTrip(tripId: number, dto: AssignVehicleType, actor: AccessTokenPayload) {
    return this.tripExecutionService.reassignTripVehicle(tripId, dto, actor)
  }

  /**
   * Cập nhật trạng thái Trip (start, cancel, complete).
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

  /** Tối ưu tuyến đường bằng OSRM */
  async optimizeRouteForTrip(tripId: number) {
    return this.tripRouteOptimizationService.optimizeRouteForTrip(tripId)
  }

  /** Thêm đơn vào chuyến PENDING */
  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor: AccessTokenPayload) {
    return this.tripExecutionService.addOrdersToTrip(tripId, dto, actor)
  }

  /** Hủy đơn khỏi chuyến PENDING */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.tripExecutionService.cancelOrderFromTrip(tripId, orderId)
  }
}
