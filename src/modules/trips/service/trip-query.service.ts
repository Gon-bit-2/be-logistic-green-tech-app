import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { GetTripsQueryType } from '../model/trip.model'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'

@Injectable()
export class TripQueryService {
  constructor(
    private readonly tripRepo: TripRepository,
    private readonly hubHelper: TripHubHelper,
  ) {}

  async getTrips(query: GetTripsQueryType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(query.hubId, actor)
    return this.tripRepo.findAll({ ...query, hubId })
  }

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
}
