import { Injectable } from '@nestjs/common'
import {
  AddOrdersToTripType,
  CancelTripBodyType,
  GetTripsQueryType,
  ManualCreateTripType,
  ReassignTripVehicleType,
} from '../model/trip.model'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { TripCapacityService } from './trip-capacity.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'
import { TripQueryService } from './trip-query.service'
import { TripVehicleAssignmentService } from './trip-vehicle-assignment.service'
import { TripLifecycleService } from './trip-lifecycle.service'
import { TripOrderMutationService } from './trip-order-mutation.service'
import { TripCreationService } from './trip-creation.service'

@Injectable()
export class TripExecutionService {
  constructor(
    private readonly hubHelper: TripHubHelper,
    private readonly tripCapacityService: TripCapacityService,
    private readonly queryService: TripQueryService,
    private readonly vehicleAssignmentService: TripVehicleAssignmentService,
    private readonly lifecycleService: TripLifecycleService,
    private readonly orderMutationService: TripOrderMutationService,
    private readonly tripCreationService: TripCreationService,
  ) {}

  getTrips(query: GetTripsQueryType, actor: AccessTokenPayload) {
    return this.queryService.getTrips(query, actor)
  }

  getTripById(id: number, actor: AccessTokenPayload) {
    return this.queryService.getTripById(id, actor)
  }

  async manualCreateTrip(dto: ManualCreateTripType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(dto.hubId, actor)
    await this.hubHelper.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)
    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, dto.driverId)
    await this.tripCapacityService.assertVehicleCapacityForOrders({
      orderIds: dto.orderIds,
      vehicleId: dto.vehicleId,
    })

    const stops = dto.orderIds.map((orderId, index) => ({
      orderId,
      hubId: null as number | null,
      stopSequence: index + 1,
      stopType: STOP_TYPE.DROPOFF,
    }))

    return this.tripCreationService.createTripWithStops(dto.vehicleId, dto.driverId, dto.orderIds, stops, undefined, {
      stateCreatedById: actor.userId,
      stateSource: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
    })
  }

  reassignTripVehicle(tripId: number, dto: ReassignTripVehicleType, actor: AccessTokenPayload) {
    return this.vehicleAssignmentService.reassignTripVehicle(tripId, dto, actor)
  }

  startTrip(tripId: number, actor: AccessTokenPayload) {
    return this.lifecycleService.startTrip(tripId, actor)
  }

  cancelTrip(tripId: number, dto: CancelTripBodyType, actor: AccessTokenPayload) {
    return this.lifecycleService.cancelTrip(tripId, dto, actor)
  }

  completeTrip(tripId: number, actor: AccessTokenPayload) {
    return this.lifecycleService.completeTrip(tripId, actor)
  }

  addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor: AccessTokenPayload) {
    return this.orderMutationService.addOrdersToTrip(tripId, dto, actor)
  }

  cancelOrderFromTrip(tripId: number, orderId: number) {
    return this.orderMutationService.cancelOrderFromTrip(tripId, orderId)
  }
}
