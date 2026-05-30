import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { GetTripListQueryType } from 'src/modules/trips/model/trip.model'
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

  findAll(query: GetTripListQueryType) {
    return this.readRepository.findAll(query)
  }

  findById(id: number) {
    return this.readRepository.findById(id)
  }

  updateTripStatus(id: number, status: keyof typeof TRIP_STATUS, extraData?: Prisma.TripUpdateInput) {
    return this.writeRepository.updateTripStatus(id, status, extraData)
  }
}
