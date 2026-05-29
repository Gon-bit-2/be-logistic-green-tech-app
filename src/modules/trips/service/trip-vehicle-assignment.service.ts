import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { ReassignTripVehicleType } from '../model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { TripCapacityService } from './trip-capacity.service'
import { AuditLogService } from 'src/common/services/audit-log.service'

@Injectable()
export class TripVehicleAssignmentService {
  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly tripCapacityService: TripCapacityService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

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

    const nextDriverId = dto.driverId ?? trip.driverId

    if (dto.driverId) {
      const driver = await this.prismaService.user.findFirst({
        where: {
          id: dto.driverId,
          deletedAt: null,
          isDeleted: false,
          role: { name: roleName.DRIVER },
        },
        select: { id: true, hubId: true },
      })

      if (!driver) throw new NotFoundException(`Driver #${dto.driverId} không tồn tại`)
      if (driver.hubId !== tripHubId) {
        throw new BadRequestException('Tài xế mới không thuộc cùng hub với chuyến.')
      }
    }

    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, nextDriverId, tripId)
    await this.tripCapacityService.assertVehicleCapacityForTrip({
      tripId,
      vehicleId: dto.vehicleId,
    })

    const updatedTrip = await this.prismaService.trip.update({
      where: { id: tripId },
      data: {
        vehicleId: dto.vehicleId,
        ...(dto.driverId ? { driverId: dto.driverId } : {}),
      },
    })

    await this.auditLogService?.record({
      action: 'TRIP_REASSIGNED',
      actorUserId: actor.userId,
      after: { driverId: updatedTrip.driverId, vehicleId: updatedTrip.vehicleId },
      before: { driverId: trip.driverId, vehicleId: trip.vehicleId },
      entityId: tripId,
      entityType: 'TRIP',
    })

    return updatedTrip
  }
}
