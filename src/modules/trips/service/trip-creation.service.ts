import { BadRequestException, Injectable } from '@nestjs/common'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { EVENT_SOURCE, EventSourceValue } from 'src/common/constants/tracking.constant'
import { PrismaService } from 'src/database/prisma.service'
import { OrderStateService } from 'src/common/services/order-state.service'
import { TripStopType } from '../model/trip.model'
import { TripWriteRepository } from '../repository/trip-write.repository'

type CreateTripWithStopsOptions = {
  allowPartial?: boolean
  assignmentRequestToApproveId?: number | null
  stateCreatedById?: number | null
  stateSource?: EventSourceValue
}

@Injectable()
export class TripCreationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tripWriteRepository: TripWriteRepository,
    private readonly orderStateService: OrderStateService,
  ) {}

  async createTripWithStops(
    vehicleId: number,
    driverId: number,
    orderIds: number[],
    stopsData: Omit<TripStopType, 'id' | 'tripId'>[],
    totalDistance?: number,
    options?: CreateTripWithStopsOptions,
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
        this.tripWriteRepository.findActiveTripByVehicle(tx, vehicleId),
        this.tripWriteRepository.findActiveTripByDriver(tx, driverId),
      ])

      if (activeVehicleTrip) {
        throw new BadRequestException(`Xe #${vehicleId} đang bận ở chuyến #${activeVehicleTrip.id}`)
      }

      if (activeDriverTrip) {
        throw new BadRequestException(`Tài xế #${driverId} đang bận ở chuyến #${activeDriverTrip.id}`)
      }

      const validOrderIds = await this.tripWriteRepository.findDispatchableOrderIds(tx, requestedOrderIds)
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

      const trip = await this.tripWriteRepository.createTripRecord(tx, {
        driverId,
        stopsData: filteredStops,
        totalDistance,
        vehicleId,
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

      await this.tripWriteRepository.cancelPendingAssignmentRequests(
        tx,
        validOrderIds,
        options?.assignmentRequestToApproveId,
      )

      if (options?.assignmentRequestToApproveId) {
        await this.tripWriteRepository.approveAssignmentRequest(tx, options.assignmentRequestToApproveId)
      }

      return trip
    })
  }
}
