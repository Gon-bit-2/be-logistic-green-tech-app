import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class TrackingAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  async assertCanViewOrderTimeline(actor: AccessTokenPayload, orderId: number): Promise<void> {
    const order = await this.getOrderAccessContext(orderId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.CUSTOMER && order.customerId === actor.userId) return

    if (actor.roleName === roleName.DRIVER && this.orderBelongsToDriver(order, actor.userId)) return

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && this.orderBelongsToHub(order, hubId)) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingOrderScope')
  }

  async assertCanCreateTrackingEvent(actor: AccessTokenPayload, orderId: number): Promise<void> {
    const order = await this.getOrderAccessContext(orderId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.DRIVER && this.orderBelongsToDriver(order, actor.userId)) return

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && this.orderBelongsToHub(order, hubId)) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingEventScope')
  }

  async assertCanJoinTripTracking(actor: AccessTokenPayload, tripId: number): Promise<void> {
    const trip = await this.getTripAccessContext(tripId)
    if (actor.roleName === roleName.ADMIN) return

    if (actor.roleName === roleName.DRIVER && trip.driverId === actor.userId) return

    if (actor.roleName === roleName.CUSTOMER) {
      const hasCustomerOrder = trip.stops.some((stop) => stop.order?.customerId === actor.userId)
      if (hasCustomerOrder) return
    }

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveActorHubId(actor)
      if (hubId && trip.vehicle?.hubId === hubId) return
    }

    throw new ForbiddenException('Error.PermissionDenied.TrackingTripScope')
  }

  async assertCanPublishTripLocation(actor: AccessTokenPayload, tripId: number): Promise<void> {
    const trip = await this.prismaService.trip.findFirst({
      where: { id: tripId },
      select: { driverId: true, id: true },
    })

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    }

    if (actor.roleName !== roleName.DRIVER || trip.driverId !== actor.userId) {
      throw new ForbiddenException('Error.PermissionDenied.NotTripDriver')
    }
  }

  private async getOrderAccessContext(orderId: number) {
    const order = await this.prismaService.order.findFirst({
      where: { deletedAt: null, id: orderId },
      select: {
        currentHubId: true,
        currentTrip: {
          select: {
            driverId: true,
            vehicle: { select: { hubId: true } },
          },
        },
        customerId: true,
        id: true,
        tripStops: {
          select: {
            trip: {
              select: {
                driverId: true,
                vehicle: { select: { hubId: true } },
              },
            },
          },
        },
      },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderId} không tồn tại`)
    }

    return order
  }

  private async getTripAccessContext(tripId: number) {
    const trip = await this.prismaService.trip.findFirst({
      where: { id: tripId },
      select: {
        driverId: true,
        id: true,
        stops: {
          select: {
            order: {
              select: { customerId: true },
            },
          },
        },
        vehicle: {
          select: { hubId: true },
        },
      },
    })

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    }

    return trip
  }

  private orderBelongsToDriver(order: Awaited<ReturnType<TrackingAccessService['getOrderAccessContext']>>, userId: number) {
    if (order.currentTrip?.driverId === userId) return true
    return order.tripStops.some((stop) => stop.trip.driverId === userId)
  }

  private orderBelongsToHub(order: Awaited<ReturnType<TrackingAccessService['getOrderAccessContext']>>, hubId: number) {
    if (order.currentHubId === hubId) return true
    if (order.currentTrip?.vehicle?.hubId === hubId) return true
    return order.tripStops.some((stop) => stop.trip.vehicle?.hubId === hubId)
  }

  private async resolveActorHubId(actor: AccessTokenPayload): Promise<number | null> {
    if (actor.hubId) return actor.hubId

    const user = await this.prismaService.user.findFirst({
      where: { deletedAt: null, id: actor.userId, isDeleted: false },
      select: { hubId: true },
    })

    return user?.hubId ?? null
  }
}
