import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AddOrdersToTripType } from '../model/trip.model'
import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { TripCapacityService } from './trip-capacity.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'
import { OrderStateService } from 'src/common/services/order-state.service'

@Injectable()
export class TripOrderMutationService {
  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly tripCapacityService: TripCapacityService,
    private readonly orderStateService: OrderStateService,
  ) {}

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
    await this.tripCapacityService.assertVehicleCapacityForOrders({
      existingTripId: tripId,
      orderIds: dto.orderIds,
      vehicleId: trip.vehicleId,
    })

    const orders = await this.prismaService.order.findMany({
      where: { id: { in: dto.orderIds } },
      select: {
        id: true,
        payment: { select: { method: true, status: true } },
        receiverLat: true,
        receiverLng: true,
        senderLat: true,
        senderLng: true,
        trackingCode: true,
      },
    })

    for (const order of orders) {
      this.hubHelper.assertOrderPaymentReadyForDispatch(order)
    }

    const existingMaxSequence = trip.stops?.length
      ? Math.max(...trip.stops.map((stop: { stopSequence: number }) => stop.stopSequence))
      : 0

    const newStops = dto.orderIds.map((orderId, index) => {
      const order = orders.find((item) => item.id === orderId)

      return {
        hubId: null as number | null,
        orderId,
        stopSequence: existingMaxSequence + index + 1,
        stopType:
          order &&
          calculateHaversineDistance(order.senderLat, order.senderLng, order.receiverLat, order.receiverLng) < 100
            ? STOP_TYPE.DROPOFF
            : STOP_TYPE.HUB_TRANSFER,
      }
    })

    return this.prismaService.$transaction(async (tx) => {
      await this.orderStateService.transitionOrdersInTransaction({
        createdById: actor.userId,
        description: `Đơn hàng được thêm vào chuyến #${tripId}.`,
        expectedCurrentTripId: null,
        expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
        extraWhere: DISPATCHABLE_PAYMENT_FILTER,
        nextOrderData: {
          currentTripId: tripId,
        },
        orderIds: dto.orderIds,
        source: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
        status: ORDER_STATUS.ASSIGNED,
        tx,
        validationMode: 'system',
      })

      await tx.tripStop.createMany({
        data: newStops.map((stop) => ({
          hubId: stop.hubId,
          orderId: stop.orderId,
          stopSequence: stop.stopSequence,
          stopType: stop.stopType,
          tripId,
        })),
      })

      return tx.trip.findUnique({
        where: { id: tripId },
        include: {
          driver: true,
          stops: { include: { order: true }, orderBy: { stopSequence: 'asc' } },
          vehicle: true,
        },
      })
    })
  }

  async cancelOrderFromTrip(tripId: number, orderId: number) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    return this.tripRepo.cancelOrderFromTrip(tripId, orderId)
  }
}
