import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class TripAvailabilityRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private buildPendingOrdersWhere(hubId?: number): Prisma.OrderWhereInput {
    return {
      status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
      deletedAt: null,
      currentTripId: null,
      ...DISPATCHABLE_PAYMENT_FILTER,
      ...(hubId ? { currentHubId: hubId } : {}),
    }
  }

  countPendingOrders(hubId?: number) {
    return this.prismaService.order.count({
      where: this.buildPendingOrdersWhere(hubId),
    })
  }

  findPendingOrders(hubId?: number, limit?: number) {
    return this.prismaService.order.findMany({
      where: this.buildPendingOrdersWhere(hubId),
      orderBy: {
        createdAt: 'asc',
      },
      ...(limit ? { take: limit } : {}),
    })
  }

  findAvailableVehicles(hubId?: number) {
    return this.prismaService.vehicle.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(hubId ? { hubId } : {}),
        trips: {
          none: {
            status: {
              in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
            },
          },
        },
      },
      select: {
        id: true,
        licensePlate: true,
        type: true,
        capacityWeight: true,
        capacityVolume: true,
        hubId: true,
        fuelType: true,
        emissionRatePerKm: true,
      },
      orderBy: [{ type: 'asc' }, { capacityWeight: 'desc' }],
    })
  }

  findAvailableDrivers(hubId?: number) {
    return this.prismaService.user.findMany({
      where: {
        role: { name: 'DRIVER' },
        isDeleted: false,
        deletedAt: null,
        ...(hubId ? { hubId } : {}),
        tripsDriven: {
          none: {
            status: {
              in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
            },
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        avatar: true,
        hubId: true,
      },
    })
  }
}
