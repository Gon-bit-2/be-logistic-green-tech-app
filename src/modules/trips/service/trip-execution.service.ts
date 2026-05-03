import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import {
  CancelTripBodyType,
  GetTripsQueryType,
  ManualCreateTripType,
  ReassignTripVehicleType,
} from '../model/trip.model'
import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'

/**
 * Service xử lý vòng đời (lifecycle) của Trip:
 * - getTrips, getTripById: Query
 * - manualCreateTrip: Tạo Trip thủ công
 * - reassignTripVehicle: Chuyển xe cho Trip
 * - startTrip, cancelTrip: Thay đổi trạng thái Trip
 */
@Injectable()
export class TripExecutionService {
  private readonly logger = new Logger(TripExecutionService.name)

  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
  ) {}

  /** Lấy danh sách chuyến (phân trang, filter) */
  async getTrips(query: GetTripsQueryType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(query.hubId, actor)
    return this.tripRepo.findAll({ ...query, hubId })
  }

  /** Lấy chi tiết 1 chuyến */
  async getTripById(id: number, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${id}`)

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (tripHubId && actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    return trip
  }

  /** Tạo Trip thủ công (Admin/Staff) */
  async manualCreateTrip(dto: ManualCreateTripType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(dto.hubId, actor)
    await this.hubHelper.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)
    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, dto.driverId)

    const stops =
      dto.orderIds.map((orderId, index) => ({
        orderId,
        hubId: null as number | null,
        stopSequence: index + 1,
        stopType: STOP_TYPE.DROPOFF,
      }))

    return this.tripRepo.createTripWithStops(dto.vehicleId, dto.driverId, dto.orderIds, stops)
  }

  /** Chuyển xe cho Trip PENDING */
  async reassignTripVehicle(tripId: number, dto: ReassignTripVehicleType, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thay đổi xe cho chuyến đang chờ khởi hành.')
    }

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (!tripHubId) throw new BadRequestException('Không xác định được Hub cho chuyến này.')

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    const vehicle = await this.prismaService.vehicle.findFirst({
      where: { id: dto.vehicleId, deletedAt: null, isActive: true },
      select: { id: true, hubId: true },
    })

    if (!vehicle) throw new NotFoundException(`Vehicle #${dto.vehicleId} không tồn tại`)
    if (vehicle.hubId !== tripHubId) {
      throw new BadRequestException('Xe mới không thuộc cùng hub với chuyến.')
    }

    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, trip.driverId, tripId)

    const updatedTrip = await this.prismaService.trip.update({
      where: { id: tripId },
      data: { vehicleId: dto.vehicleId },
    })

    return updatedTrip
  }

  /** Tài xế bắt đầu chuyến */
  async startTrip(tripId: number, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        driverId: true,
        id: true,
        status: true,
        stops: {
          select: {
            order: {
              select: {
                id: true,
                payment: {
                  select: { method: true, status: true },
                },
                status: true,
                trackingCode: true,
              },
            },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.driverId !== actor.userId) throw new ForbiddenException('Bạn không phải tài xế của chuyến này.')
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chuyến phải ở trạng thái PENDING mới có thể bắt đầu.')
    }

    for (const stop of trip.stops) {
      if (stop.order) {
        this.hubHelper.assertOrderPaymentReadyForDispatch(stop.order)
      }
    }

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
      const orderIds = trip.stops
        .filter((stop) => stop.order)
        .map((stop) => stop.order!.id)

      if (orderIds.length) {
        await tx.order.updateMany({
          where: {
            id: { in: orderIds },
            status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ARRIVED_AT_HUB] },
          },
          data: { status: ORDER_STATUS.IN_TRANSIT },
        })
      }

      return tx.trip.update({
        where: { id: tripId },
        data: { status: TRIP_STATUS.IN_PROGRESS },
      })
    })

    return updatedTrip
  }

  /** Hủy chuyến PENDING và trả lại trạng thái đơn hàng */
  async cancelTrip(tripId: number, dto: CancelTripBodyType, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        status: true,
        driverId: true,
        stops: {
          select: {
            order: { select: { id: true, status: true } },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy chuyến đang ở trạng thái PENDING.')
    }

    const orderIds = trip.stops
      .filter((stop) => stop.order)
      .map((stop) => stop.order!.id)

    const cancelledTrip = await this.prismaService.$transaction(async (tx) => {
      if (orderIds.length) {
        await tx.order.updateMany({
          where: {
            id: { in: orderIds },
            status: ORDER_STATUS.ASSIGNED,
          },
          data: {
            currentTripId: null,
            status: ORDER_STATUS.PENDING,
          },
        })
      }

      return tx.trip.update({
        where: { id: tripId },
        data: {
          status: TRIP_STATUS.CANCELLED,
        },
      })
    })

    return cancelledTrip
  }
}
