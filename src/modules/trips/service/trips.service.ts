import { Injectable, Logger } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
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
import { TripStatusType, TRIP_STATUS, STOP_TYPE } from 'src/common/constants/trip.constant'
import { GamificationService } from '../../green-tech/service/gamification.service'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { optimizeRouteWithOSRM, RouteCoordinate } from 'src/common/utils/routing.util'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant'
import type { ProofOfDeliveryInputType } from 'src/modules/tracking/model/tracking.model'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { DispatchService } from './dispatch.service'
import { DispatchBoardService } from './dispatch-board.service'
import { DriverAssignmentService } from './driver-assignment.service'
import { TripExecutionService } from './trip-execution.service'
import { TripHubHelper } from './trip-hub.helper'

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
  private readonly logger = new Logger(TripsService.name)

  constructor(
    private readonly dispatchService: DispatchService,
    private readonly dispatchBoardService: DispatchBoardService,
    private readonly driverAssignmentService: DriverAssignmentService,
    private readonly tripExecutionService: TripExecutionService,
    private readonly hubHelper: TripHubHelper,
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly trackingRepo: TrackingRepository,
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

  // ========================
  // CÁC METHODS PHỨC TẠP — Giữ lại tạm, sẽ tách ở phase tiếp theo
  // ========================

  /**
   * Cập nhật trạng thái Trip (start, cancel, complete).
   * Logic phức tạp: phụ thuộc vào gamification, tracking, order state machine.
   */
  async updateStatus(id: number, body: UpdateTripStatusType, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến #${id}`)
    }

    const newStatus: TripStatusType = body.status

    if (newStatus === TRIP_STATUS.IN_PROGRESS) {
      return this.tripExecutionService.startTrip(id, actor)
    }

    if (newStatus === TRIP_STATUS.CANCELLED) {
      return this.tripExecutionService.cancelTrip(id, {}, actor)
    }

    if (newStatus === TRIP_STATUS.COMPLETED) {
      return this.completeTripWithTracking(id, actor)
    }

    throw new BadRequestException(`Trạng thái "${newStatus}" không hợp lệ.`)
  }

  /**
   * Hoàn thành chuyến với tracking records tự động.
   * TODO: Tối ưu N+1 query (phase tiếp theo)
   */
  private async completeTripWithTracking(tripId: number, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: {
        stops: {
          include: {
            order: {
              select: {
                id: true,
                payment: { select: { method: true, status: true } },
                status: true,
                trackingCode: true,
                receiverLat: true,
                receiverLng: true,
                senderLat: true,
                senderLng: true,
              },
            },
          },
        },
        vehicle: {
          select: {
            emissionRatePerKm: true,
            fuelType: true,
            id: true,
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    if (trip.status !== TRIP_STATUS.IN_PROGRESS) {
      throw new BadRequestException('Chuyến phải đang ở trạng thái IN_PROGRESS mới có thể hoàn thành.')
    }

    if (trip.driverId !== actor.userId) {
      throw new ForbiddenException('Bạn không phải tài xế của chuyến này.')
    }

    const validStops = trip.stops.filter((stop) => stop.order && stop.order.status !== ORDER_STATUS.CANCELLED)

    const hasNonDeliveredOrder = validStops.some((stop) => stop.order && stop.order.status !== ORDER_STATUS.DELIVERED)

    if (hasNonDeliveredOrder) {
      throw new BadRequestException('Còn đơn hàng chưa giao xong. Hãy cập nhật trạng thái từng đơn trước.')
    }

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
      // Batch update: gom tất cả order IDs chưa DELIVERED → 1 query duy nhất
      // Thay vì loop N lần order.update(), chỉ cần 1 lần updateMany()
      const nonDeliveredOrderIds = validStops
        .filter(
          (stop) =>
            stop.order && stop.order.status !== ORDER_STATUS.DELIVERED && stop.order.status !== ORDER_STATUS.CANCELLED,
        )
        .map((stop) => stop.order!.id)

      if (nonDeliveredOrderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: nonDeliveredOrderIds } },
          data: { status: ORDER_STATUS.DELIVERED },
        })
      }

      return tx.trip.update({
        where: { id: tripId },
        data: {
          endTime: new Date(),
          status: TRIP_STATUS.COMPLETED,
        },
      })
    })

    try {
      if (trip.vehicle) {
        const totalDistanceKm = validStops.reduce((sum, stop) => {
          if (!stop.order) return sum
          return (
            sum +
            calculateHaversineDistance(
              stop.order.senderLat,
              stop.order.senderLng,
              stop.order.receiverLat,
              stop.order.receiverLng,
            )
          )
        }, 0)

        await this.gamificationService.processTripEmission(tripId)
      }
    } catch (error) {
      this.logger.warn(
        `Gamification failed for trip #${tripId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return updatedTrip
  }

  /** Tối ưu tuyến đường bằng OSRM */
  async optimizeRouteForTrip(tripId: number) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: {
        stops: {
          include: {
            order: {
              select: {
                receiverLat: true,
                receiverLng: true,
                senderLat: true,
                senderLng: true,
              },
            },
          },
          orderBy: { stopSequence: 'asc' },
        },
        vehicle: {
          select: {
            hub: { select: { latitude: true, longitude: true } },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    const coordinates: RouteCoordinate[] = []

    if (trip.vehicle?.hub) {
      coordinates.push({ lng: trip.vehicle.hub.longitude, lat: trip.vehicle.hub.latitude })
    }

    for (const stop of trip.stops) {
      if (!stop.order) continue
      if (stop.stopType === STOP_TYPE.PICKUP) {
        coordinates.push({ lng: stop.order.senderLng, lat: stop.order.senderLat })
      } else {
        coordinates.push({ lng: stop.order.receiverLng, lat: stop.order.receiverLat })
      }
    }

    if (coordinates.length < 2) {
      throw new BadRequestException('Không đủ điểm dừng để tối ưu tuyến đường.')
    }

    const optimizedRoute = await optimizeRouteWithOSRM(coordinates)

    if (optimizedRoute.waypoints?.length) {
      // optimizedRoute.waypoints đã được sort theo waypoint_index trong routing.util
      // Offset: nếu có hub thì waypoint[0] là hub → stops bắt đầu từ index 1
      const offset = trip.vehicle?.hub ? 1 : 0
      const sortedStops = [...trip.stops].sort((a, b) => {
        const indexA = trip.stops.indexOf(a) + offset
        const indexB = trip.stops.indexOf(b) + offset
        return indexA - indexB
      })

      await this.prismaService.$transaction(
        sortedStops.map((stop, index) =>
          this.prismaService.tripStop.update({
            where: { id: stop.id },
            data: { stopSequence: index + 1 },
          }),
        ),
      )
    }

    return {
      optimizedRoute,
      tripId,
    }
  }

  /** Thêm đơn vào chuyến PENDING */
  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn vào chuyến đang chờ khởi hành.')
    }

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (!tripHubId) throw new BadRequestException('Không xác định được Hub cho chuyến này.')

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    await this.hubHelper.assertOrdersBelongToHub(tripHubId, dto.orderIds)

    const orders = await this.prismaService.order.findMany({
      where: { id: { in: dto.orderIds } },
      select: {
        id: true,
        payment: { select: { method: true, status: true } },
        trackingCode: true,
        senderLat: true,
        senderLng: true,
        receiverLat: true,
        receiverLng: true,
      },
    })

    for (const order of orders) {
      this.hubHelper.assertOrderPaymentReadyForDispatch(order)
    }

    const existingMaxSequence = trip.stops?.length
      ? Math.max(...trip.stops.map((stop: { stopSequence: number }) => stop.stopSequence))
      : 0

    const newStops = dto.orderIds.map((orderId, index) => {
      const order = orders.find((o) => o.id === orderId)
      return {
        orderId,
        hubId: null as number | null,
        stopSequence: existingMaxSequence + index + 1,
        stopType:
          order &&
          calculateHaversineDistance(order.senderLat, order.senderLng, order.receiverLat, order.receiverLng) < 100
            ? STOP_TYPE.DROPOFF
            : STOP_TYPE.HUB_TRANSFER,
      }
    })

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          id: { in: dto.orderIds },
          currentTripId: null,
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          ...DISPATCHABLE_PAYMENT_FILTER,
        },
        data: {
          currentTripId: tripId,
          status: ORDER_STATUS.ASSIGNED,
        },
      })

      await tx.tripStop.createMany({
        data: newStops.map((stop) => ({
          tripId,
          orderId: stop.orderId,
          hubId: stop.hubId,
          stopSequence: stop.stopSequence,
          stopType: stop.stopType,
        })),
      })

      return tx.trip.findUnique({
        where: { id: tripId },
        include: {
          stops: { include: { order: true }, orderBy: { stopSequence: 'asc' } },
          vehicle: true,
          driver: true,
        },
      })
    })

    return updatedTrip
  }

  /** Hủy đơn khỏi chuyến PENDING */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: { stops: true },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn khỏi chuyến đang chờ khởi hành.')
    }

    const stop = trip.stops.find((stop) => stop.orderId === orderId)
    if (!stop) throw new NotFoundException(`Đơn #${orderId} không thuộc chuyến #${tripId}`)

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          currentTripId: null,
          status: ORDER_STATUS.PENDING,
        },
      })

      await tx.tripStop.delete({
        where: { id: stop.id },
      })

      const remainingStops = await tx.tripStop.findMany({
        where: { tripId },
        orderBy: { stopSequence: 'asc' },
      })

      if (!remainingStops.length) {
        return tx.trip.update({
          where: { id: tripId },
          data: { status: TRIP_STATUS.CANCELLED },
        })
      }

      for (let i = 0; i < remainingStops.length; i++) {
        await tx.tripStop.update({
          where: { id: remainingStops[i].id },
          data: { stopSequence: i + 1 },
        })
      }

      return tx.trip.findUnique({ where: { id: tripId }, include: { stops: true } })
    })

    return updatedTrip
  }
}
