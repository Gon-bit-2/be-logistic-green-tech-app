import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { EventSourceValue } from 'src/common/constants/tracking.constant'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { GetTripListQueryType, TripStopType } from 'src/modules/trips/model/trip.model'
import { TripAvailabilityRepository } from './trip-availability.repository'
import { TripReadRepository } from './trip-read.repository'
import { TripWriteRepository } from './trip-write.repository'

@Injectable()
export class TripRepository {
  constructor(
    private readonly availabilityRepository: TripAvailabilityRepository,
    private readonly readRepository: TripReadRepository,
    private readonly writeRepository: TripWriteRepository,
  ) {}

  countPendingOrders(hubId?: number) {
    return this.availabilityRepository.countPendingOrders(hubId)
  }

  findPendingOrders(hubId?: number, limit?: number) {
    return this.availabilityRepository.findPendingOrders(hubId, limit)
  }

  findAvailableVehicles(hubId?: number) {
    return this.availabilityRepository.findAvailableVehicles(hubId)
  }

  findAvailableDrivers(hubId?: number) {
    return this.availabilityRepository.findAvailableDrivers(hubId)
  }

  createTripWithStops(
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
    return this.writeRepository.createTripWithStops(vehicleId, driverId, orderIds, stopsData, totalDistance, options)
  }

  findAll(query: GetTripListQueryType) {
    return this.readRepository.findAll(query)
  }

  findById(id: number) {
    return this.readRepository.findById(id)
  }

  updateTripStatus(id: number, status: keyof typeof TRIP_STATUS, extraData?: Prisma.TripUpdateInput) {
    return this.writeRepository.updateTripStatus(id, status, extraData)
  }

  cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.writeRepository.cancelOrderFromTrip(tripId, orderId)
  }
}
