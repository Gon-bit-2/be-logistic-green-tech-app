import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { EVENT_SOURCE, EventSourceValue } from 'src/common/constants/tracking.constant'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { OrderStateService } from 'src/common/services/order-state.service'
import { PrismaService } from 'src/database/prisma.service'
import { TripStopType } from 'src/modules/trips/model/trip.model'

@Injectable()
export class TripWriteRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderStateService: OrderStateService,
  ) {}

  async createTripWithStops(
    vehicleId: number,
    driverId: number,
    orderIds: number[],
    stopsData: Omit<TripStopType, 'id' | 'tripId'>[],
    totalDistance?: number,
    options?: {
      allowPartial?: boolean
      assignmentRequestToApproveId?: number | null
      stateCreatedById?: number | null
      stateSource?: EventSourceValue
    },
  ) {
    const requestedOrderIds = [...new Set(orderIds)]
    if (requestedOrderIds.length !== orderIds.length) {
      throw new BadRequestException('Danh sách đơn hàng không được chứa trùng lặp.')
    }
    if (!requestedOrderIds.length) {
      throw new BadRequestException('Cần chọn ít nhất một đơn hàng để tạo chuyến.')
    }

    return this.prismaService.$transaction(async (tx) => {
      const [activeVehicleTrip, activeDriverTrip] = await Promise.all([
        tx.trip.findFirst({
          where: {
            status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
            vehicleId,
          },
          select: { id: true },
        }),
        tx.trip.findFirst({
          where: {
            driverId,
            status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
          },
          select: { id: true },
        }),
      ])

      if (activeVehicleTrip) {
        throw new BadRequestException(`Xe #${vehicleId} đang bận ở chuyến #${activeVehicleTrip.id}`)
      }

      if (activeDriverTrip) {
        throw new BadRequestException(`Tài xế #${driverId} đang bận ở chuyến #${activeDriverTrip.id}`)
      }

      const stillPendingOrders = await tx.order.findMany({
        where: {
          id: { in: requestedOrderIds },
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          currentTripId: null,
          ...DISPATCHABLE_PAYMENT_FILTER,
        },
        select: { id: true },
      })

      const validOrderIds = stillPendingOrders.map((o) => o.id)
      const allowPartial = options?.allowPartial ?? false

      if (validOrderIds.length === 0 && allowPartial) {
        return null
      }

      if (!allowPartial && validOrderIds.length !== requestedOrderIds.length) {
        throw new BadRequestException('Một hoặc nhiều đơn hàng không còn khả dụng để điều phối.')
      }

      if (validOrderIds.length === 0) {
        throw new BadRequestException('Không còn đơn hàng khả dụng để tạo chuyến.')
      }

      const validOrderIdSet = new Set(validOrderIds)
      const filteredStops = stopsData.filter(
        (stop) => stop.orderId === null || stop.orderId === undefined || validOrderIdSet.has(stop.orderId),
      )
      const stopOrderIds = new Set(
        filteredStops.map((stop) => stop.orderId).filter((orderId): orderId is number => orderId != null),
      )
      const missingStopOrderIds = validOrderIds.filter((orderId) => !stopOrderIds.has(orderId))
      if (missingStopOrderIds.length) {
        throw new BadRequestException(`Thiếu stop cho đơn hàng: ${missingStopOrderIds.join(', ')}`)
      }

      const trip = await tx.trip.create({
        data: {
          vehicleId,
          driverId,
          status: TRIP_STATUS.PENDING,
          totalDistance: totalDistance ?? null,
          stops: {
            create: filteredStops,
          },
        },
        include: {
          stops: true,
        },
      })

      await this.orderStateService.transitionOrdersInTransaction({
        createdById: options?.stateCreatedById ?? null,
        description: `Đơn hàng được gán vào chuyến #${trip.id}.`,
        expectedCurrentTripId: null,
        expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
        extraWhere: DISPATCHABLE_PAYMENT_FILTER,
        nextOrderData: {
          currentTripId: trip.id,
        },
        orderIds: validOrderIds,
        source: options?.stateSource ?? EVENT_SOURCE.SYSTEM,
        status: ORDER_STATUS.ASSIGNED,
        tx,
        validationMode: 'system',
      })

      await tx.driverAssignmentRequest.updateMany({
        where: {
          orderId: { in: validOrderIds },
          status: 'PENDING',
          ...(options?.assignmentRequestToApproveId ? { id: { not: options.assignmentRequestToApproveId } } : {}),
        },
        data: {
          status: 'CANCELLED',
          reviewedAt: new Date(),
        },
      })

      if (options?.assignmentRequestToApproveId) {
        await tx.driverAssignmentRequest.update({
          where: { id: options.assignmentRequestToApproveId },
          data: {
            reviewedAt: new Date(),
            status: 'APPROVED',
          },
        })
      }

      return trip
    })
  }

  updateTripStatus(id: number, status: keyof typeof TRIP_STATUS, extraData?: Prisma.TripUpdateInput) {
    return this.prismaService.trip.update({
      where: { id },
      data: {
        status,
        ...extraData,
      },
      include: {
        driver: {
          select: {
            avatar: true,
            fullName: true,
            id: true,
          },
        },
        stops: {
          include: {
            order: {
              select: {
                currentHubId: true,
                id: true,
                preferredDeliveryTimeEnd: true,
                preferredDeliveryTimeStart: true,
                receiverAddress: true,
                receiverLat: true,
                receiverLng: true,
                receiverName: true,
                receiverPhone: true,
                senderAddress: true,
                senderLat: true,
                senderLng: true,
                status: true,
                totalVolume: true,
                totalWeight: true,
                trackingCode: true,
              },
            },
          },
          orderBy: { stopSequence: 'asc' },
        },
        vehicle: {
          select: {
            capacityVolume: true,
            capacityWeight: true,
            emissionRatePerKm: true,
            fuelType: true,
            hubId: true,
            id: true,
            isActive: true,
            licensePlate: true,
            type: true,
          },
        },
      },
    })
  }

  async cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.prismaService.$transaction(async (tx) => {
      await tx.tripStop.deleteMany({
        where: { tripId, orderId },
      })

      await this.orderStateService.transitionOrderStatus({
        createdById: null,
        description: `Đơn hàng #${orderId} bị hủy khỏi chuyến #${tripId}.`,
        nextOrderData: {
          currentTripId: null,
        },
        orderId,
        source: EVENT_SOURCE.SYSTEM,
        status: ORDER_STATUS.CANCELLED,
        tx,
        validationMode: 'system',
      })

      const remainingOrderStops = await tx.tripStop.findMany({
        where: { tripId, orderId: { not: null } },
        orderBy: { stopSequence: 'asc' },
      })

      if (remainingOrderStops.length === 0) {
        await tx.tripStop.deleteMany({ where: { tripId } })
        await tx.trip.update({
          where: { id: tripId },
          data: { status: TRIP_STATUS.CANCELLED },
        })
        return { tripCancelled: true }
      }

      const allRemainingStops = await tx.tripStop.findMany({
        where: { tripId },
        orderBy: { stopSequence: 'asc' },
      })

      for (let i = 0; i < allRemainingStops.length; i++) {
        if (allRemainingStops[i].stopSequence !== i + 1) {
          await tx.tripStop.update({
            where: { id: allRemainingStops[i].id },
            data: { stopSequence: i + 1 },
          })
        }
      }

      return { tripCancelled: false }
    })
  }
}
